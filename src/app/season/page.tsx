'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { RpChart } from '@/components/RpChart';
import { Heatmap } from '@/components/Heatmap';
import { RankBadge } from '@/components/RankBadge';
import { labelForRp, rankFor } from '@/lib/rank';
import { SEASON_DAYS } from '@/lib/engine';
import { addDays, daysBetween, shortLabel } from '@/lib/dates';

export default function SeasonPage() {
  const { state, ready, today } = useStore();

  const stats = useMemo(() => {
    const days = Object.values(state.days)
      .filter((d) => d.dateKey >= state.profile.seasonStartKey)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    const logged = days.filter((d) => d.outcome !== 'missed');
    const cleared = days.filter((d) => d.score >= d.par);
    const elapsed = Math.max(0, daysBetween(state.profile.seasonStartKey, today));

    return {
      days,
      elapsed,
      remaining: Math.max(0, SEASON_DAYS - elapsed),
      clearRate: days.length ? Math.round((cleared.length / days.length) * 100) : 0,
      avgScore: logged.length
        ? Math.round(logged.reduce((sum, d) => sum + d.score, 0) / logged.length)
        : 0,
      best: days.reduce<null | (typeof days)[number]>(
        (best, d) => (!best || d.score > best.score ? d : best),
        null,
      ),
      missed: days.filter((d) => d.outcome === 'missed').length,
    };
  }, [state, today]);

  if (!ready) return <Skeleton />;

  const rank = rankFor(state.profile.rp);

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <RankBadge rp={state.profile.rp} size={44} />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold">Season {state.profile.seasonId}</h1>
          <p className="num text-xs text-[color:var(--color-ink-faint)]">
            day {stats.elapsed + 1} of {SEASON_DAYS} · ends{' '}
            {shortLabel(addDays(state.profile.seasonStartKey, SEASON_DAYS))}
          </p>
        </div>
        <div className="text-right">
          <div className="num text-lg font-bold" style={{ color: rank.color }}>
            {state.profile.rp}
          </div>
          <div className="text-[10px] text-[color:var(--color-ink-faint)]">RP</div>
        </div>
      </header>

      <section className="card p-3">
        <RpChart days={stats.days} />
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Par cleared" value={`${stats.clearRate}%`} tone="var(--color-gain)" />
        <Stat label="Avg score" value={String(stats.avgScore)} />
        <Stat label="Longest streak" value={String(state.profile.longestStreak)} tone="var(--color-crit)" />
        <Stat
          label="Peak rank"
          value={labelForRp(state.profile.peakRp)}
          tone={rankFor(state.profile.peakRp).color}
        />
        <Stat
          label="Best day"
          value={stats.best ? `${Math.round(stats.best.score)}` : '—'}
          sub={stats.best ? shortLabel(stats.best.dateKey) : undefined}
        />
        <Stat
          label="Days missed"
          value={String(stats.missed)}
          tone={stats.missed > 0 ? 'var(--color-burn)' : undefined}
        />
      </div>

      <section className="card p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-[color:var(--color-ink-faint)]">
          Calendar
        </h2>
        <Heatmap state={state} today={today} />
        <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--color-ink-faint)]">
          Season resets in {stats.remaining} days. Your RP compresses toward the
          middle rather than wiping — you keep most of what you climbed, and there
          is something to climb back to.
        </p>
      </section>

      {stats.days.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[color:var(--color-ink-faint)]">
            History
          </h2>
          <ul className="divide-y divide-[color:var(--color-line)] overflow-hidden rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
            {stats.days
              .slice()
              .reverse()
              .slice(0, 20)
              .map((day) => (
                <li key={day.dateKey} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <span className="num w-12 shrink-0 text-xs text-[color:var(--color-ink-faint)]">
                    {shortLabel(day.dateKey)}
                  </span>
                  <span className="num w-20 shrink-0 text-xs">
                    {Math.round(day.score)}
                    <span className="text-[color:var(--color-ink-faint)]"> / {Math.round(day.par)}</span>
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-[color:var(--color-ink-faint)]">
                    {day.modifiers.map((m) => m.label).join(' · ') || outcomeLabel(day.outcome)}
                  </span>
                  <span
                    className="num shrink-0 text-sm font-semibold"
                    style={{ color: day.rpDelta >= 0 ? 'var(--color-gain)' : 'var(--color-burn)' }}
                  >
                    {day.rpDelta >= 0 ? '+' : ''}
                    {day.rpDelta}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function outcomeLabel(outcome: string): string {
  return (
    {
      cleared: 'Cleared par',
      missed: 'Under par',
      shielded: 'Shield spent',
      placement: 'Placement',
      rest: 'Rest day',
    }[outcome] ?? outcome
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="card px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-widest text-[color:var(--color-ink-faint)]">
        {label}
      </div>
      <div className="num mt-0.5 text-lg font-bold" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="num text-[10px] text-[color:var(--color-ink-faint)]">{sub}</div>}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <span className="num text-sm text-[color:var(--color-ink-faint)]">loading…</span>
    </div>
  );
}
