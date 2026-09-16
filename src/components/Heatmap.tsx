'use client';

import type { AppState } from '@/lib/types';
import { addDays, daysBetween, weekdayLetter, shortLabel } from '@/lib/dates';
import { totalPoints } from '@/lib/scoring';

/**
 * Season calendar. One square a day, brightness by how far over or under par
 * the day landed. Making the gaps visible is the point - a row of dark squares
 * says more than any number.
 */
export function Heatmap({ state, today }: { state: AppState; today: string }) {
  const start = state.profile.seasonStartKey;
  const total = Math.max(0, daysBetween(start, today)) + 1;
  const keys = Array.from({ length: total }, (_, i) => addDays(start, i));

  // Pad the front so columns line up with weekdays.
  const leading = (new Date(start).getDay() + 6) % 7;

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[9px] text-[color:var(--color-ink-faint)]">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((letter, i) => (
          <span key={i}>{letter}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leading }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}

        {keys.map((key) => {
          const record = state.days[key];
          const isToday = key === today;
          const score = record ? record.score : totalPoints(state.entries.filter((e) => e.dateKey === key));
          const par = record?.par ?? state.settings.baselinePar;
          const ratio = par > 0 ? score / par : 0;

          return (
            <div
              key={key}
              title={`${shortLabel(key)} · ${Math.round(score)} / ${Math.round(par)} par${
                record ? ` · ${record.rpDelta >= 0 ? '+' : ''}${record.rpDelta} RP` : ''
              }`}
              className="aspect-square rounded-[4px] border"
              style={{
                background: fill(ratio, record?.outcome),
                borderColor: isToday ? 'var(--color-accent)' : 'transparent',
              }}
            >
              <span className="sr-only">
                {weekdayLetter(key)} {shortLabel(key)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fill(ratio: number, outcome?: string): string {
  if (outcome === 'shielded') return 'rgba(139,124,246,.55)';
  if (outcome === 'rest') return 'rgba(255,255,255,.08)';
  if (ratio <= 0) return 'rgba(255,255,255,.045)';
  if (ratio < 0.5) return 'rgba(255,61,110,.35)';
  if (ratio < 1) return `rgba(53,214,200,${(0.18 + ratio * 0.3).toFixed(2)})`;
  const over = Math.min(1, (ratio - 1) / 0.8);
  return `rgba(46,232,107,${(0.5 + over * 0.45).toFixed(2)})`;
}
