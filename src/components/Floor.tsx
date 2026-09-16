'use client';

import type { Activity } from '@/lib/types';
import { useStore } from '@/lib/store';
import { KEYSTONE_MISS_RP } from '@/lib/engine';
import { rawPointsFor } from '@/lib/scoring';

/**
 * The floor: today's non-negotiables.
 *
 * Kept visually separate from the quick-tap grid on purpose. Everything in that
 * grid is optional upside; this is the stuff that was already due. Burying it
 * among thirteen identical tiles would make the one thing you actually have to
 * do look exactly like the twelve you don't.
 */
export function Floor({ keystones, loggedIds }: { keystones: Activity[]; loggedIds: Set<string> }) {
  const { log } = useStore();
  if (keystones.length === 0) return null;

  const outstanding = keystones.filter((a) => !loggedIds.has(a.id));
  const allDone = outstanding.length === 0;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[color:var(--color-ink-faint)]">
          The floor
        </h2>
        <span
          className="text-[11px]"
          style={{ color: allDone ? 'var(--color-gain)' : 'var(--color-ink-faint)' }}
        >
          {allDone ? 'clear' : `${KEYSTONE_MISS_RP} RP each if skipped`}
        </span>
      </div>

      <ul className="space-y-1.5">
        {keystones.map((activity) => {
          const done = loggedIds.has(activity.id);
          const worth = Math.round(rawPointsFor(activity, 1) * 10) / 10;

          return (
            <li key={activity.id}>
              <button
                onClick={() => !done && log({ activityId: activity.id, amount: 1 })}
                disabled={done}
                aria-pressed={done}
                className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all active:scale-[0.98] disabled:active:scale-100"
                style={{
                  borderColor: done ? 'rgba(46,232,107,.35)' : 'var(--color-crit)',
                  background: done ? 'rgba(46,232,107,.06)' : 'rgba(255,210,63,.05)',
                }}
              >
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2"
                  style={{
                    borderColor: done ? 'var(--color-gain)' : 'var(--color-crit)',
                    background: done ? 'var(--color-gain)' : 'transparent',
                  }}
                >
                  {done && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#07080c" strokeWidth="3.5">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-sm font-medium"
                    style={{ color: done ? 'var(--color-ink-dim)' : 'var(--color-ink)' }}
                  >
                    {activity.emoji} {activity.name}
                  </span>
                  {!done && activity.cue && (
                    // The if-then plan, surfaced at the moment it's relevant
                    // rather than filed away in a settings screen.
                    <span className="mt-0.5 block truncate text-[11px] text-[color:var(--color-ink-faint)]">
                      {activity.cue}
                    </span>
                  )}
                </span>

                <span
                  className="num shrink-0 text-sm font-bold"
                  style={{ color: done ? 'var(--color-gain)' : 'var(--color-crit)' }}
                >
                  +{worth}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
