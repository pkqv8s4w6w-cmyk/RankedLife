'use client';

/**
 * Today's score against par.
 *
 * The ring is the goal gradient made visible: effort accelerates as the gap to
 * the target closes, so the gap has to be on screen and unambiguous. Past 100%
 * a second, brighter arc keeps going - overshooting should look like something.
 */
export function ScoreRing({
  score,
  par,
  size = 200,
}: {
  score: number;
  par: number;
  size?: number;
}) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const ratio = par > 0 ? score / par : 0;
  const primary = Math.max(0, Math.min(1, ratio));
  const overflow = Math.max(0, Math.min(1, ratio - 1));

  const negative = score < 0;
  const mainColor = negative ? 'var(--color-burn)' : 'var(--color-accent)';
  const gap = Math.max(0, Math.ceil(par - score));

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={mainColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - (negative ? 0.02 : primary))}
          style={{ transition: 'stroke-dashoffset .5s cubic-bezier(.2,.8,.2,1)' }}
        />
        {overflow > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-gain)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - overflow)}
            style={{
              transition: 'stroke-dashoffset .5s cubic-bezier(.2,.8,.2,1)',
              filter: 'drop-shadow(0 0 8px rgba(46,232,107,.55))',
            }}
          />
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className="num text-5xl font-semibold tabular-nums"
          style={{ color: negative ? 'var(--color-burn)' : 'var(--color-ink)' }}
        >
          {Math.round(score)}
        </div>
        <div className="num mt-0.5 text-xs text-[color:var(--color-ink-faint)]">
          par {Math.round(par)}
        </div>
        <div className="mt-2 text-[11px] font-medium tracking-wide">
          {gap > 0 ? (
            <span className="text-[color:var(--color-ink-dim)]">
              <span className="num text-[color:var(--color-accent)]">{gap}</span> to clear
            </span>
          ) : (
            <span className="text-[color:var(--color-gain)]">
              +{Math.round((ratio - 1) * 100)}% over par
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
