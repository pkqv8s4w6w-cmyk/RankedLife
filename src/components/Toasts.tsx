'use client';

import { useStore } from '@/lib/store';

const TONE: Record<string, { border: string; text: string; glow: string }> = {
  good: { border: 'var(--color-gain)', text: 'var(--color-gain)', glow: 'rgba(46,232,107,.25)' },
  bad: { border: 'var(--color-burn)', text: 'var(--color-burn)', glow: 'rgba(255,61,110,.25)' },
  crit: { border: 'var(--color-crit)', text: 'var(--color-crit)', glow: 'rgba(255,210,63,.35)' },
  info: { border: 'var(--color-line)', text: 'var(--color-ink)', glow: 'rgba(0,0,0,0)' },
};

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 pt-3"
      role="status"
      aria-live="polite"
    >
      {toasts.slice(-2).map((toast) => {
        const tone = TONE[toast.tone] ?? TONE.info;
        return (
          <button
            key={toast.id}
            onClick={() => dismissToast(toast.id)}
            className={`pointer-events-auto flex w-full max-w-sm items-baseline gap-2 rounded-xl border bg-[color:var(--color-surface-2)]/95 px-3.5 py-2 text-left backdrop-blur-xl ${
              toast.tone === 'crit' ? 'animate-crit' : ''
            } animate-rise`}
            style={{ borderColor: tone.border, boxShadow: `0 0 24px ${tone.glow}` }}
          >
            <span className="num shrink-0 text-sm font-semibold" style={{ color: tone.text }}>
              {toast.title}
            </span>
            {toast.detail && (
              <span className="truncate text-xs text-[color:var(--color-ink-dim)]">{toast.detail}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
