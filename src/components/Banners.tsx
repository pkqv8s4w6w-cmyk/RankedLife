'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store';
import { freshStartLabel } from '@/lib/dates';

/**
 * The red bar. One collapsed day leaves you owing a make-up before RP gains run
 * at full rate again - a real consequence, but a specific, small and clearable
 * one. Vague punishment just teaches you to close the app.
 */
export function PenaltyBanner() {
  const { state } = useStore();
  const box = state.penaltyBox;
  if (!box || box.cleared) return null;

  return (
    <div
      className="animate-rise rounded-2xl border px-4 py-3"
      style={{ borderColor: 'var(--color-burn)', background: 'rgba(255,61,110,.07)' }}
    >
      <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-burn)' }}>
        Penalty box
      </div>
      <p className="mt-1 text-sm">
        Yesterday collapsed. RP gains are halved until you clear this:{' '}
        <span className="font-semibold">{box.task}</span>
      </p>
    </div>
  );
}

/** Gate status, when the gate is armed. */
export function GateBanner({ score }: { score: number }) {
  const { state } = useStore();
  const gate = state.settings.gate;
  if (!gate.enabled) return null;

  const open = score >= gate.threshold;
  const remaining = Math.max(0, Math.round((gate.threshold - score) * 10) / 10);

  return (
    <Link
      href="/settings"
      className="flex items-center gap-2.5 rounded-2xl border px-4 py-2.5 text-sm"
      style={{
        borderColor: open ? 'rgba(46,232,107,.3)' : 'rgba(255,61,110,.3)',
        background: open ? 'rgba(46,232,107,.05)' : 'rgba(255,61,110,.05)',
      }}
    >
      <span>{open ? '🔓' : '🔒'}</span>
      <span className="flex-1" style={{ color: open ? 'var(--color-gain)' : 'var(--color-burn)' }}>
        {open ? 'Gate open. Sites unblocked.' : `${remaining} points until sites unblock.`}
      </span>
    </Link>
  );
}

/**
 * Temporal landmarks reliably spike aspirational behaviour, so we say so out
 * loud on the days that carry one rather than letting them pass unremarked.
 */
export function FreshStartBanner({ dateKey }: { dateKey: string }) {
  const label = freshStartLabel(dateKey);
  if (!label) return null;

  return (
    <div
      className="rounded-2xl border px-4 py-2.5 text-sm"
      style={{ borderColor: 'rgba(53,214,200,.3)', background: 'rgba(53,214,200,.05)' }}
    >
      <span style={{ color: 'var(--color-accent)' }}>{label}.</span>{' '}
      <span className="text-[color:var(--color-ink-dim)]">Clean slate. Start it now.</span>
    </div>
  );
}
