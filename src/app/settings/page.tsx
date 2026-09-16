'use client';

import { useEffect, useState } from 'react';
import { useStore, getSyncKey, setSyncKey } from '@/lib/store';
import type { AppState } from '@/lib/types';
import { SEASON_DAYS } from '@/lib/engine';

export default function SettingsPage() {
  const { state, ready, update, resetAll, replaceState, pushToast, syncStatus } = useStore();
  const [key, setKey] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => setKey(getSyncKey()), []);

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="num text-sm text-[color:var(--color-ink-faint)]">loading…</span>
      </div>
    );
  }

  const { settings } = state;
  const setSettings = (patch: Partial<typeof settings>) =>
    update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const setGate = (patch: Partial<typeof settings.gate>) =>
    update((s) => ({ ...s, settings: { ...s.settings, gate: { ...s.settings.gate, ...patch } } }));

  function exportState() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rankedlife-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importState(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppState;
        if (typeof parsed?.version !== 'number' || !Array.isArray(parsed.activities)) {
          throw new Error('not a Ranked Life export');
        }
        replaceState(parsed);
        pushToast({ title: 'Imported', tone: 'good' });
      } catch (err) {
        pushToast({
          title: 'Import failed',
          detail: err instanceof Error ? err.message : undefined,
          tone: 'bad',
        });
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-5 pb-4">
      <h1 className="text-lg font-bold">Settings</h1>

      {/* ---- The gate: the one consequence that reaches outside the app ---- */}
      <Card
        title="The gate"
        sub="Block distracting sites until you've banked enough points. Needs the browser extension in extension/."
      >
        <Toggle
          label="Arm the gate"
          checked={settings.gate.enabled}
          onChange={(v) => setGate({ enabled: v })}
        />

        {settings.gate.enabled && (
          <>
            <Row label="Points needed to unlock">
              <NumberInput
                value={settings.gate.threshold}
                onChange={(v) => setGate({ threshold: Math.max(0, v) })}
              />
            </Row>
            <Row label="Always open before">
              <select
                value={settings.gate.openBeforeHour}
                onChange={(e) => setGate({ openBeforeHour: Number(e.target.value) })}
                className="rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-3 py-1.5 text-sm"
              >
                {Array.from({ length: 25 }, (_, h) => (
                  <option key={h} value={h}>
                    {h === 0 ? 'never' : `${h}:00`}
                  </option>
                ))}
              </select>
            </Row>
            <div className="mt-3">
              <div className="mb-1.5 text-xs text-[color:var(--color-ink-dim)]">
                Blocked domains, one per line
              </div>
              <textarea
                defaultValue={settings.gate.sites.join('\n')}
                onBlur={(e) =>
                  setGate({
                    sites: e.target.value
                      .split('\n')
                      .map((s) => s.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
                      .filter(Boolean),
                  })
                }
                rows={5}
                className="num w-full resize-none rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-3 py-2.5 text-sm outline-none"
              />
            </div>
          </>
        )}
      </Card>

      <Card title="Difficulty" sub="How hard the system is on you.">
        <Toggle
          label="Spend shields automatically"
          hint="Absorbs a bad day rather than taking the RP loss. Only fires on days you actually showed up for."
          checked={settings.autoShield}
          onChange={(v) => setSettings({ autoShield: v })}
        />
        <Toggle
          label="Penalty box"
          hint="A collapsed day leaves you owing a make-up before RP gains run at full rate."
          checked={settings.penaltyBoxEnabled}
          onChange={(v) => setSettings({ penaltyBoxEnabled: v })}
        />
        <Row label="Day starts at">
          <select
            value={settings.dayRolloverHour}
            onChange={(e) => setSettings({ dayRolloverHour: Number(e.target.value) })}
            className="rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-3 py-1.5 text-sm"
          >
            {[0, 1, 2, 3, 4, 5, 6].map((h) => (
              <option key={h} value={h}>
                {h}:00
              </option>
            ))}
          </select>
        </Row>
        <Row label="Starting par">
          <NumberInput
            value={settings.baselinePar}
            onChange={(v) => setSettings({ baselinePar: Math.max(10, v) })}
          />
        </Row>
        <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--color-ink-faint)]">
          Starting par only matters for your first five days. After that par is your
          own 14-day median, so it tracks whatever you actually do.
        </p>
      </Card>

      <Card
        title="Sync"
        sub="Everything works offline on this device. A key here keeps your phone, laptop and iPad on the same save."
      >
        <Row label="Status">
          <span
            className="num text-xs"
            style={{
              color:
                syncStatus === 'error'
                  ? 'var(--color-burn)'
                  : syncStatus === 'off'
                    ? 'var(--color-ink-faint)'
                    : 'var(--color-gain)',
            }}
          >
            {
              { idle: 'synced', saving: 'saving…', error: 'failed', off: 'local only' }[
                syncStatus
              ]
            }
          </span>
        </Row>
        <div className="mt-2">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onBlur={() => {
              setSyncKey(key.trim());
              pushToast({ title: key.trim() ? 'Key saved' : 'Key cleared', tone: 'info' });
            }}
            placeholder="Sync key"
            className="num w-full rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-4 py-2.5 text-sm outline-none"
          />
          <p className="mt-1.5 text-[11px] text-[color:var(--color-ink-faint)]">
            Must match RANKEDLIFE_KEY on the server. Stored on this device only.
          </p>
        </div>
      </Card>

      <Card title="Your data" sub="It's one JSON file. Take it anywhere.">
        <div className="flex gap-2">
          <button
            onClick={exportState}
            className="flex-1 rounded-xl border border-[color:var(--color-line)] py-2.5 text-sm"
          >
            Export
          </button>
          <label className="flex-1 cursor-pointer rounded-xl border border-[color:var(--color-line)] py-2.5 text-center text-sm">
            Import
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importState(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        <button
          onClick={() => {
            if (!confirmReset) {
              setConfirmReset(true);
              return;
            }
            resetAll();
            setConfirmReset(false);
          }}
          onBlur={() => setConfirmReset(false)}
          className="mt-2 w-full rounded-xl border py-2.5 text-sm"
          style={{ borderColor: 'var(--color-burn)', color: 'var(--color-burn)' }}
        >
          {confirmReset ? 'Tap again to erase everything' : 'Reset all data'}
        </button>
      </Card>

      <Card title="How scoring works" sub="No hidden math.">
        <ul className="space-y-2 text-[11px] leading-relaxed text-[color:var(--color-ink-dim)]">
          <li>
            <strong className="text-[color:var(--color-ink)]">Par</strong> is the median
            of your last 14 scored days, plus 3%. Farm easy points and par rises to
            meet you, so it buys you nothing.
          </li>
          <li>
            <strong className="text-[color:var(--color-ink)]">Friction</strong> multiplies
            what an activity is worth, from ×0.7 for things you enjoy to ×1.55 for
            things you dread.
          </li>
          <li>
            <strong className="text-[color:var(--color-ink)]">Diminishing returns</strong>{' '}
            halve, then quarter, points past each activity&rsquo;s daily ceiling.
          </li>
          <li>
            <strong className="text-[color:var(--color-ink)]">Crits</strong> fire on a
            variable schedule with a pity timer. Capped at 40% of the day&rsquo;s build
            total so they can never carry a day on their own.
          </li>
          <li>
            <strong className="text-[color:var(--color-ink)]">RP</strong> runs +10 to +40
            for clearing par, −6 to −36 for missing it, −18 for a day you never opened
            the app.
          </li>
          <li>
            <strong className="text-[color:var(--color-ink)]">Missing a day</strong>{' '}
            damages your streak by 3, it never zeroes it. One lapse genuinely
            doesn&rsquo;t undo a habit, and pretending otherwise is how these apps
            lose people.
          </li>
          <li>
            <strong className="text-[color:var(--color-ink)]">Seasons</strong> last{' '}
            {SEASON_DAYS} days, then RP compresses toward the middle and placements
            start over.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {sub && <p className="mb-3 mt-0.5 text-[11px] text-[color:var(--color-ink-faint)]">{sub}</p>}
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-[color:var(--color-ink-dim)]">{label}</span>
      {children}
    </div>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="num w-20 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-3 py-1.5 text-right text-sm outline-none"
    />
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--color-accent)]"
      />
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint && (
          <span className="mt-0.5 block text-[11px] leading-relaxed text-[color:var(--color-ink-faint)]">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}
