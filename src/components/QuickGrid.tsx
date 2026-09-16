'use client';

import { useState } from 'react';
import type { Activity } from '@/lib/types';
import { useStore } from '@/lib/store';
import { AmountSheet } from './AmountSheet';

/**
 * The quick-tap grid.
 *
 * A check activity logs on one tap - no confirm, no sheet, no dialog. Anything
 * with an amount opens a sheet whose preset chips are one more tap. Two taps is
 * the ceiling for logging anything, because the moment it costs more than that
 * the app stops getting opened.
 */
export function QuickGrid({ activities }: { activities: Activity[] }) {
  const { log } = useStore();
  const [sheetFor, setSheetFor] = useState<Activity | null>(null);

  if (activities.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[color:var(--color-ink-faint)]">
        Nothing pinned. Pin activities in Loadout to get them here.
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {activities.map((activity) => (
          <button
            key={activity.id}
            onClick={() => {
              if (activity.kind === 'check') log({ activityId: activity.id, amount: 1 });
              else setSheetFor(activity);
            }}
            className="group flex flex-col items-center gap-1.5 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-2 py-3 transition-all active:scale-[0.96]"
            style={{
              borderColor:
                activity.polarity === 'burn' ? 'rgba(255,61,110,.28)' : 'var(--color-line)',
            }}
          >
            <span className="text-2xl leading-none">{activity.emoji}</span>
            <span className="line-clamp-2 text-center text-[11px] font-medium leading-tight text-[color:var(--color-ink-dim)]">
              {activity.name}
            </span>
            <span
              className="num text-[10px] font-semibold"
              style={{
                color:
                  activity.polarity === 'burn' ? 'var(--color-burn)' : 'var(--color-gain)',
              }}
            >
              {activity.polarity === 'burn' ? '−' : '+'}
              {formatRate(activity)}
            </span>
          </button>
        ))}
      </div>

      {sheetFor && (
        <AmountSheet
          activity={sheetFor}
          onClose={() => setSheetFor(null)}
          onConfirm={(amount) => {
            log({ activityId: sheetFor.id, amount });
            setSheetFor(null);
          }}
        />
      )}
    </>
  );
}

/** Points per standard unit, shown so the tile is self-explanatory. */
function formatRate(activity: Activity): string {
  const rounded = Math.round(activity.points * 10) / 10;
  switch (activity.kind) {
    case 'duration':
      return `${rounded}/30m`;
    case 'money':
      return `${rounded}/$10`;
    case 'count':
      return `${rounded}/${activity.unit ?? 'ea'}`;
    default:
      return String(rounded);
  }
}
