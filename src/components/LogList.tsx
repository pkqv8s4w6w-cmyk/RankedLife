'use client';

import type { LogEntry } from '@/lib/types';
import { useStore } from '@/lib/store';

/** Everything logged today, newest first, each one removable until midnight. */
export function LogList({ entries }: { entries: LogEntry[] }) {
  const { state, unlog } = useStore();
  if (entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[color:var(--color-ink-faint)]">
        Logged
      </h2>
      <ul className="divide-y divide-[color:var(--color-line)] overflow-hidden rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
        {sorted.map((entry) => {
          const activity = state.activities.find((a) => a.id === entry.activityId);
          const negative = entry.points < 0;
          return (
            <li key={entry.id} className="flex items-center gap-2.5 px-3 py-2.5">
              <span className="shrink-0 text-lg">{activity?.emoji ?? '•'}</span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm">{activity?.name ?? 'Removed activity'}</span>
                  {entry.crit && (
                    <span
                      className="num shrink-0 rounded px-1 text-[10px] font-bold"
                      style={{ background: 'var(--color-crit)', color: '#07080c' }}
                    >
                      {entry.crit.label} ×{entry.crit.multiplier}
                    </span>
                  )}
                  {entry.backfillFactor && (
                    <span className="shrink-0 text-[10px] text-[color:var(--color-ink-faint)]">
                      late
                    </span>
                  )}
                </div>
                <div className="num text-[11px] text-[color:var(--color-ink-faint)]">
                  {activity && activity.kind !== 'check'
                    ? `${activity.kind === 'money' ? '$' : ''}${entry.amount}${
                        activity.kind !== 'money' && activity.unit ? ` ${activity.unit}` : ''
                      }`
                    : entry.source === 'ai'
                      ? 'from voice'
                      : ''}
                  {entry.note ? ` · ${entry.note}` : ''}
                </div>
              </div>

              <span
                className="num shrink-0 text-sm font-semibold"
                style={{ color: negative ? 'var(--color-burn)' : 'var(--color-gain)' }}
              >
                {negative ? '' : '+'}
                {entry.points}
              </span>

              <button
                onClick={() => unlog(entry.id)}
                aria-label={`Remove ${activity?.name ?? 'entry'}`}
                className="shrink-0 p-1 text-[color:var(--color-ink-faint)] transition-colors hover:text-[color:var(--color-burn)]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
