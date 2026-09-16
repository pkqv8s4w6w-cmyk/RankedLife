'use client';

import { rankFor } from '@/lib/rank';

/**
 * The rank crest. Two chevrons whose count and glow come from the tier, so
 * Bronze and Diamond are distinguishable at a glance from across the room.
 */
export function RankBadge({ rp, size = 64 }: { rp: number; size?: number }) {
  const rank = rankFor(rp);
  const stroke = size * 0.1;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-label={rank.label}
      role="img"
      style={{ filter: `drop-shadow(0 0 ${size * 0.18}px ${rank.color}55)` }}
    >
      <defs>
        <linearGradient id={`rb-${rank.tier.name}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={rank.glow} />
          <stop offset="100%" stopColor={rank.color} />
        </linearGradient>
      </defs>
      <path
        d="M8 42 L32 20 L56 42"
        fill="none"
        stroke={`url(#rb-${rank.tier.name})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 56 L32 34 L56 56"
        fill="none"
        stroke={`url(#rb-${rank.tier.name})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.5}
      />
    </svg>
  );
}
