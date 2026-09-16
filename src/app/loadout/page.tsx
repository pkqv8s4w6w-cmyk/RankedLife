'use client';

import { useState } from 'react';
import type { Activity, ActivityKind, Friction, Polarity } from '@/lib/types';
import { useStore } from '@/lib/store';
import { FRICTION_LABEL, FRICTION_MULT, rawPointsFor } from '@/lib/scoring';

export default function LoadoutPage() {
  const { state, ready, saveActivity, deleteActivity } = useStore();
  const [editing, setEditing] = useState<Activity | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="num text-sm text-[color:var(--color-ink-faint)]">loading…</span>
      </div>
    );
  }

  const live = state.activities.filter((a) => !a.archived);
  const builds = live.filter((a) => a.polarity === 'build');
  const burns = live.filter((a) => a.polarity === 'burn');
  const archived = state.activities.filter((a) => a.archived);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Loadout</h1>
          <p className="text-xs text-[color:var(--color-ink-faint)]">
            What counts, and what it&rsquo;s worth.
          </p>
        </div>
        <button
          onClick={() => setEditing(blankActivity())}
          className="rounded-xl px-3.5 py-2 text-sm font-semibold text-black"
          style={{ background: 'var(--color-accent)' }}
        >
          + New
        </button>
      </header>

      <Group title="Builds" activities={builds} onEdit={setEditing} />
      <Group title="Burns" activities={burns} onEdit={setEditing} tone="var(--color-burn)" />

      {archived.length > 0 && (
        <section>
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="text-xs text-[color:var(--color-ink-faint)] underline underline-offset-4"
          >
            {showArchived ? 'Hide' : 'Show'} {archived.length} archived
          </button>
          {showArchived && (
            <ul className="mt-2 space-y-1.5">
              {archived.map((activity) => (
                <li
                  key={activity.id}
                  className="flex items-center gap-2 rounded-xl border border-[color:var(--color-line)] px-3 py-2 text-sm opacity-60"
                >
                  <span>{activity.emoji}</span>
                  <span className="min-w-0 flex-1 truncate">{activity.name}</span>
                  <button
                    onClick={() => saveActivity({ ...activity, archived: false })}
                    className="text-xs text-[color:var(--color-accent)]"
                  >
                    restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="text-[11px] leading-relaxed text-[color:var(--color-ink-faint)]">
        Editing points only affects entries from here on. Days already settled keep
        the score they were given — otherwise a tweak today would quietly rewrite
        last month&rsquo;s rank.
      </p>

      {editing && (
        <ActivityEditor
          activity={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            saveActivity(next);
            setEditing(null);
          }}
          onDelete={
            state.activities.some((a) => a.id === editing.id)
              ? () => {
                  deleteActivity(editing.id);
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function Group({
  title,
  activities,
  onEdit,
  tone,
}: {
  title: string;
  activities: Activity[];
  onEdit: (a: Activity) => void;
  tone?: string;
}) {
  if (activities.length === 0) return null;
  return (
    <section>
      <h2
        className="mb-2 text-xs font-semibold uppercase tracking-widest"
        style={{ color: tone ?? 'var(--color-ink-faint)' }}
      >
        {title}
      </h2>
      <ul className="space-y-1.5">
        {activities.map((activity) => (
          <li key={activity.id}>
            <button
              onClick={() => onEdit(activity)}
              className="flex w-full items-center gap-3 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2.5 text-left"
            >
              <span className="text-xl">{activity.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm">{activity.name}</span>
                  {activity.pinned && <span className="text-[10px]">📌</span>}
                </div>
                <div className="num text-[11px] text-[color:var(--color-ink-faint)]">
                  {FRICTION_LABEL[activity.friction]} · ×{FRICTION_MULT[activity.friction]}
                  {activity.cue ? ' · has a cue' : ''}
                </div>
              </div>
              <span
                className="num shrink-0 text-sm font-semibold"
                style={{
                  color: activity.polarity === 'burn' ? 'var(--color-burn)' : 'var(--color-gain)',
                }}
              >
                {activity.polarity === 'burn' ? '−' : '+'}
                {Math.round(rawPointsFor(activity, standardAmount(activity)) * 10) / 10}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function standardAmount(activity: Activity): number {
  if (activity.kind === 'duration') return 30;
  if (activity.kind === 'money') return 10;
  return 1;
}

function blankActivity(): Activity {
  return {
    id: `custom-${Date.now().toString(36)}`,
    name: '',
    emoji: '✨',
    polarity: 'build',
    kind: 'duration',
    unit: 'min',
    points: 8,
    friction: 3,
    softCap: 16,
    pinned: true,
    archived: false,
    createdAt: Date.now(),
  };
}

const KINDS: { value: ActivityKind; label: string; unit?: string }[] = [
  { value: 'duration', label: 'Time', unit: 'min' },
  { value: 'check', label: 'Done / not' },
  { value: 'count', label: 'Count', unit: 'reps' },
  { value: 'money', label: 'Money', unit: '$' },
];

function ActivityEditor({
  activity,
  onClose,
  onSave,
  onDelete,
}: {
  activity: Activity;
  onClose: () => void;
  onSave: (a: Activity) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(activity);
  const set = <K extends keyof Activity>(key: K, value: Activity[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const preview = rawPointsFor(draft, standardAmount(draft));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-label="Close" />

      <div
        className="animate-rise relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-t border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[color:var(--color-line)]" />

        <div className="mb-4 flex gap-2">
          <input
            value={draft.emoji}
            onChange={(e) => set('emoji', e.target.value.slice(0, 4))}
            aria-label="Emoji"
            className="w-14 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] py-3 text-center text-xl outline-none"
          />
          <input
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Name"
            aria-label="Name"
            className="min-w-0 flex-1 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-4 py-3 outline-none placeholder:text-[color:var(--color-ink-faint)]"
          />
        </div>

        <Field label="Earns or costs">
          <Segmented
            options={[
              { value: 'build', label: 'Build' },
              { value: 'burn', label: 'Burn' },
            ]}
            value={draft.polarity}
            onChange={(v) => set('polarity', v as Polarity)}
          />
        </Field>

        <Field label="Measured in">
          <Segmented
            options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
            value={draft.kind}
            onChange={(v) => {
              const kind = KINDS.find((k) => k.value === v)!;
              setDraft((prev) => ({ ...prev, kind: kind.value, unit: kind.unit }));
            }}
          />
        </Field>

        <Field
          label={
            draft.kind === 'duration'
              ? 'Points per 30 minutes'
              : draft.kind === 'money'
                ? 'Points per $10'
                : draft.kind === 'count'
                  ? `Points per ${draft.unit ?? 'unit'}`
                  : 'Points per completion'
          }
        >
          <input
            type="number"
            inputMode="decimal"
            value={draft.points}
            onChange={(e) => set('points', Math.max(0, Number(e.target.value) || 0))}
            className="w-full rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-4 py-3 outline-none"
          />
        </Field>

        {draft.polarity === 'build' && (
          <>
            <Field label="How much you dread it">
              <Segmented
                options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
                value={String(draft.friction)}
                onChange={(v) => set('friction', Number(v) as Friction)}
              />
              <p className="mt-1.5 text-[11px] text-[color:var(--color-ink-faint)]">
                {FRICTION_LABEL[draft.friction]} — multiplies by ×
                {FRICTION_MULT[draft.friction]}. Things you enjoy score below 1 on
                purpose; paying you for those would just make you enjoy them less.
              </p>
            </Field>

            <Field label="Full-credit ceiling per day">
              <input
                type="number"
                inputMode="decimal"
                value={draft.softCap}
                onChange={(e) => set('softCap', Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-4 py-3 outline-none"
              />
              <p className="mt-1.5 text-[11px] text-[color:var(--color-ink-faint)]">
                Points past this decay hard — half, then a quarter. Stops one easy
                activity from becoming the whole score.
              </p>
            </Field>
          </>
        )}

        <Field label="If-then plan (optional)">
          <textarea
            value={draft.cue ?? ''}
            onChange={(e) => set('cue', e.target.value)}
            rows={2}
            placeholder="If it is 7pm and I've eaten, then I start this."
            className="w-full resize-none rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-4 py-3 text-sm outline-none placeholder:text-[color:var(--color-ink-faint)]"
          />
        </Field>

        <label className="mb-4 flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={draft.pinned}
            onChange={(e) => set('pinned', e.target.checked)}
            className="h-4 w-4 accent-[color:var(--color-accent)]"
          />
          Show as a quick-tap tile
        </label>

        <div className="mb-4 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-4 py-3 text-sm">
          <span className="text-[color:var(--color-ink-dim)]">
            {draft.kind === 'duration'
              ? '30 minutes'
              : draft.kind === 'money'
                ? '$10'
                : `1 ${draft.unit ?? 'time'}`}{' '}
            is worth{' '}
          </span>
          <span
            className="num font-bold"
            style={{ color: draft.polarity === 'burn' ? 'var(--color-burn)' : 'var(--color-gain)' }}
          >
            {draft.polarity === 'burn' ? '−' : '+'}
            {Math.round(preview * 10) / 10}
          </span>
        </div>

        <div className="flex gap-2">
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded-xl border px-4 py-3 text-sm"
              style={{ borderColor: 'var(--color-burn)', color: 'var(--color-burn)' }}
            >
              Archive
            </button>
          )}
          <button
            onClick={() => draft.name.trim() && onSave({ ...draft, name: draft.name.trim() })}
            disabled={!draft.name.trim()}
            className="flex-1 rounded-xl py-3 font-semibold text-black disabled:opacity-30"
            style={{ background: 'var(--color-accent)' }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-xs font-medium text-[color:var(--color-ink-dim)]">{label}</div>
      {children}
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className="flex-1 rounded-lg py-2 text-sm font-medium transition-colors"
            style={{
              background: active ? 'var(--color-accent)' : 'transparent',
              color: active ? '#07080c' : 'var(--color-ink-dim)',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
