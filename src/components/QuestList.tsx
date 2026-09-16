'use client';

import type { Quest } from '@/lib/types';
import { ALL_QUESTS_BONUS } from '@/lib/quests';

/**
 * Three objectives, redrawn daily from your own activity list.
 *
 * Deliberately low-stakes. Their job is to keep what the app asks for slightly
 * unpredictable and to push you at the thing you'd skip - not to become a
 * second scoreboard you start optimising for instead of the real one.
 */
export function QuestList({ quests }: { quests: Quest[] }) {
  if (quests.length === 0) return null;
  const done = quests.filter((q) => q.done).length;
  const perfect = done === quests.length;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[color:var(--color-ink-faint)]">
          Today&rsquo;s draw
        </h2>
        <span
          className="num text-xs"
          style={{ color: perfect ? 'var(--color-crit)' : 'var(--color-ink-faint)' }}
        >
          {done}/{quests.length}
          {perfect ? ` · +${ALL_QUESTS_BONUS} RP` : ''}
        </span>
      </div>

      <ul className="space-y-1.5">
        {quests.map((quest) => (
          <li
            key={quest.id}
            className="flex items-center gap-2.5 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2.5"
            style={quest.done ? { borderColor: 'rgba(46,232,107,.3)' } : undefined}
          >
            <span
              className="grid h-5 w-5 shrink-0 place-items-center rounded-md border"
              style={{
                borderColor: quest.done ? 'var(--color-gain)' : 'var(--color-line)',
                background: quest.done ? 'var(--color-gain)' : 'transparent',
              }}
            >
              {quest.done && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#07080c" strokeWidth="3.5">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>

            <span
              className="min-w-0 flex-1 truncate text-sm"
              style={{ color: quest.done ? 'var(--color-ink-dim)' : 'var(--color-ink)' }}
            >
              {quest.label}
            </span>

            <span className="num shrink-0 text-xs text-[color:var(--color-ink-faint)]">
              +{quest.reward}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
