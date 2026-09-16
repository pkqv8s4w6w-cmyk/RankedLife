'use client';

import { useEffect, useRef, useState } from 'react';
import type { Activity } from '@/lib/types';
import { FRICTION_LABEL, rawPointsFor } from '@/lib/scoring';

const FALLBACK_PRESETS: Record<Activity['kind'], number[]> = {
  duration: [15, 30, 45, 60, 90, 120],
  count: [1, 2, 3, 5, 10],
  money: [5, 10, 20, 50, 100],
  check: [1],
};

/**
 * Amount picker. Presets first, keypad second - the keypad exists for the rare
 * exact number, not as the default path.
 */
export function AmountSheet({
  activity,
  onClose,
  onConfirm,
}: {
  activity: Activity;
  onClose: () => void;
  onConfirm: (amount: number) => void;
}) {
  const [custom, setCustom] = useState('');
  const presets = activity.presets?.length ? activity.presets : FALLBACK_PRESETS[activity.kind];
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const parsed = Number(custom);
  const customValid = custom !== '' && Number.isFinite(parsed) && parsed > 0;
  const preview = customValid ? rawPointsFor(activity, parsed) : 0;
  const sign = activity.polarity === 'burn' ? '−' : '+';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <button
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="animate-rise relative w-full max-w-lg rounded-t-3xl border-t border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[color:var(--color-line)]" />

        <div className="mb-4 flex items-center gap-3">
          <span className="text-3xl">{activity.emoji}</span>
          <div className="min-w-0">
            <div className="truncate font-semibold">{activity.name}</div>
            <div className="text-xs text-[color:var(--color-ink-faint)]">
              {FRICTION_LABEL[activity.friction]} · ×{frictionFactor(activity)}
            </div>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2">
          {presets.map((value) => (
            <button
              key={value}
              onClick={() => onConfirm(value)}
              className="rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] py-3 transition-transform active:scale-95"
            >
              <div className="num text-lg font-semibold">
                {activity.kind === 'money' ? '$' : ''}
                {value}
              </div>
              <div className="num text-[10px] text-[color:var(--color-ink-faint)]">
                {sign}
                {Math.round(rawPointsFor(activity, value) * 10) / 10} pts
              </div>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customValid) onConfirm(parsed);
            }}
            placeholder={activity.unit ? `Exact ${activity.unit}` : 'Exact amount'}
            className="min-w-0 flex-1 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-4 py-3 outline-none placeholder:text-[color:var(--color-ink-faint)]"
          />
          <button
            onClick={() => customValid && onConfirm(parsed)}
            disabled={!customValid}
            className="num rounded-xl px-5 py-3 font-semibold text-black transition-opacity disabled:opacity-30"
            style={{
              background:
                activity.polarity === 'burn' ? 'var(--color-burn)' : 'var(--color-accent)',
            }}
          >
            {customValid ? `${sign}${Math.round(preview * 10) / 10}` : 'Log'}
          </button>
        </div>
      </div>
    </div>
  );
}

function frictionFactor(activity: Activity): number {
  if (activity.polarity === 'burn') return 1;
  return { 1: 0.7, 2: 0.85, 3: 1, 4: 1.25, 5: 1.55 }[activity.friction] ?? 1;
}
