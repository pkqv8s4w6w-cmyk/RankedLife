'use client';

/**
 * State container.
 *
 * Local-first on purpose. The whole document goes into localStorage
 * synchronously on every change, so the app works with no network, no account
 * and no setup - which is the only way it gets opened on day one. Sync to the
 * server is a debounced background push on top of that, so a flaky connection
 * degrades to "works fine on this device" rather than "lost my entry".
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Activity, AppState, LogEntry } from './types';
import { DEFAULT_ACTIVITIES, freshState, STATE_VERSION } from './defaults';
import { catchUp, refreshPenaltyBox, addEntry as engineAdd, removeEntry as engineRemove } from './engine';
import { todayKey } from './dates';

const LS_KEY = 'rankedlife:state:v1';
const LS_SYNCKEY = 'rankedlife:synckey';
const SYNC_DEBOUNCE_MS = 1500;

export interface Toast {
  id: string;
  title: string;
  detail?: string;
  tone: 'good' | 'bad' | 'crit' | 'info';
}

interface StoreValue {
  state: AppState;
  ready: boolean;
  today: string;
  toasts: Toast[];
  syncStatus: 'idle' | 'saving' | 'error' | 'off';
  update: (fn: (s: AppState) => AppState) => void;
  log: (input: { activityId: string; amount: number; dateKey?: string; note?: string; source?: LogEntry['source'] }) => void;
  unlog: (entryId: string) => void;
  saveActivity: (a: Activity) => void;
  deleteActivity: (id: string) => void;
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  replaceState: (s: AppState) => void;
  resetAll: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function loadLocal(): AppState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (typeof parsed?.version !== 'number') return null;
    return migrate(parsed);
  } catch {
    return null;
  }
}

/** Forward-only migrations. Unknown future versions are left alone. */
function migrate(state: AppState): AppState {
  let s = state;

  // v2 introduced keystones - daily obligations that cost RP when skipped.
  // Anyone already using the app gets the to-do list one added rather than a
  // reset, and their existing activities are left exactly as they are.
  if (s.version < 2 && !(s.activities ?? []).some((a) => a.keystone)) {
    const template = DEFAULT_ACTIVITIES.find((a) => a.keystone);
    if (template && !(s.activities ?? []).some((a) => a.id === template.id)) {
      s = { ...s, activities: [template, ...(s.activities ?? [])] };
    }
  }

  if (s.version < STATE_VERSION) {
    s = { ...s, version: STATE_VERSION };
  }
  // Guard against a partially-written document from an older build.
  return {
    ...s,
    entries: s.entries ?? [],
    days: s.days ?? {},
    quests: s.quests ?? {},
    wagers: s.wagers ?? [],
    activities: s.activities ?? [],
  };
}

function saveLocal(state: AppState) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // Quota or private mode. The in-memory state still works for this session.
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => freshState());
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [syncStatus, setSyncStatus] = useState<StoreValue['syncStatus']>('idle');
  const [today, setToday] = useState(() => todayKey(4));

  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(state);
  latest.current = state;

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // ---- boot --------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const local = loadLocal();
      let base = local ?? freshState();

      // Pull the server copy and take whichever revision is newer.
      const key = window.localStorage.getItem(LS_SYNCKEY) ?? undefined;
      try {
        const res = await fetch('/api/sync', {
          headers: key ? { 'x-rl-key': key } : undefined,
          cache: 'no-store',
        });
        if (res.ok) {
          const body = (await res.json()) as { state?: AppState | null; configured?: boolean };
          if (body.configured === false) setSyncStatus('off');
          if (body.state && (!local || body.state.rev > local.rev)) {
            base = migrate(body.state);
          }
        }
      } catch {
        // Offline. Local copy stands.
      }

      const result = catchUp(base);
      let next = refreshPenaltyBox(result.state);
      next = { ...next, updatedAt: Date.now() };

      if (cancelled) return;
      setState(next);
      setToday(todayKey(next.settings.dayRolloverHour));
      saveLocal(next);
      setReady(true);

      for (const event of result.events.slice(0, 3)) {
        pushToast({ title: event, tone: 'info' });
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [pushToast]);

  // ---- persist + sync ----------------------------------------------------
  const commit = useCallback(
    (next: AppState) => {
      setState(next);
      saveLocal(next);

      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        const key = window.localStorage.getItem(LS_SYNCKEY) ?? undefined;
        setSyncStatus('saving');
        fetch('/api/sync', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            ...(key ? { 'x-rl-key': key } : {}),
          },
          body: JSON.stringify(latest.current),
        })
          .then(async (res) => {
            if (!res.ok) {
              setSyncStatus(res.status === 501 ? 'off' : 'error');
              return;
            }
            const body = (await res.json()) as {
              state?: AppState;
              stale?: boolean;
              configured?: boolean;
            };
            // Another device got there first with a newer revision.
            if (body.stale && body.state && body.state.rev > latest.current.rev) {
              const merged = migrate(body.state);
              setState(merged);
              saveLocal(merged);
            }
            // Don't claim "synced" when there is no backing store - without one
            // the server copy is a dev-only file and your phone and laptop are
            // still two separate saves.
            setSyncStatus(body.configured === false ? 'off' : 'idle');
          })
          .catch(() => setSyncStatus('error'));
      }, SYNC_DEBOUNCE_MS);
    },
    [],
  );

  const update = useCallback(
    (fn: (s: AppState) => AppState) => {
      const current = latest.current;
      const next = fn(current);
      if (next === current) return;
      commit({ ...next, rev: current.rev + 1, updatedAt: Date.now() });
    },
    [commit],
  );

  // ---- day rollover ------------------------------------------------------
  // Cheap poll rather than a scheduled timer: the tab may sleep for hours, so
  // wall-clock checks are the only thing that survives a laptop lid closing.
  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      const key = todayKey(latest.current.settings.dayRolloverHour);
      if (key !== today) {
        const result = catchUp(latest.current);
        update(() => refreshPenaltyBox(result.state));
        setToday(key);
      }
    };
    const interval = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ready, today, update]);

  // ---- actions -----------------------------------------------------------
  const log = useCallback<StoreValue['log']>(
    (input) => {
      const current = latest.current;
      const dateKey = input.dateKey ?? todayKey(current.settings.dayRolloverHour);
      const { state: next, entry } = engineAdd(current, {
        activityId: input.activityId,
        amount: input.amount,
        dateKey,
        note: input.note,
        source: input.source ?? 'tap',
      });

      if (!entry) {
        pushToast({ title: 'Could not log that', detail: 'That day is already settled.', tone: 'bad' });
        return;
      }

      const activity = current.activities.find((a) => a.id === entry.activityId);
      commit({ ...refreshPenaltyBox(next), rev: current.rev + 1, updatedAt: Date.now() });

      if (entry.crit) {
        pushToast({
          title: `${entry.crit.label} ×${entry.crit.multiplier}`,
          detail: `${activity?.name} · +${entry.points} pts`,
          tone: 'crit',
        });
      } else {
        pushToast({
          title: `${entry.points > 0 ? '+' : ''}${entry.points} pts`,
          detail: activity?.name,
          tone: entry.points >= 0 ? 'good' : 'bad',
        });
      }
    },
    [commit, pushToast],
  );

  const unlog = useCallback(
    (entryId: string) => update((s) => engineRemove(s, entryId)),
    [update],
  );

  const saveActivity = useCallback(
    (activity: Activity) =>
      update((s) => {
        const exists = s.activities.some((a) => a.id === activity.id);
        return {
          ...s,
          activities: exists
            ? s.activities.map((a) => (a.id === activity.id ? activity : a))
            : [...s.activities, activity],
        };
      }),
    [update],
  );

  /**
   * Archive rather than delete. Past entries reference the activity for their
   * labels, and silently orphaning history is worse than a longer list.
   */
  const deleteActivity = useCallback(
    (id: string) =>
      update((s) => ({
        ...s,
        activities: s.activities.map((a) =>
          a.id === id ? { ...a, archived: true, pinned: false } : a,
        ),
      })),
    [update],
  );

  const replaceState = useCallback(
    (incoming: AppState) => {
      const result = catchUp(migrate(incoming));
      commit({ ...result.state, rev: latest.current.rev + 1, updatedAt: Date.now() });
    },
    [commit],
  );

  const resetAll = useCallback(() => {
    const next = freshState();
    commit({ ...next, rev: latest.current.rev + 1 });
  }, [commit]);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      ready,
      today,
      toasts,
      syncStatus,
      update,
      log,
      unlog,
      saveActivity,
      deleteActivity,
      pushToast,
      dismissToast,
      replaceState,
      resetAll,
    }),
    [
      state, ready, today, toasts, syncStatus, update, log, unlog,
      saveActivity, deleteActivity, pushToast, dismissToast, replaceState, resetAll,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

export function getSyncKey(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(LS_SYNCKEY) ?? '';
}

export function setSyncKey(key: string) {
  if (key) window.localStorage.setItem(LS_SYNCKEY, key);
  else window.localStorage.removeItem(LS_SYNCKEY);
}
