'use client';

import type { DayRecord } from '@/lib/types';
import { TIERS } from '@/lib/rank';

/**
 * RP over the season. Tier floors are drawn in as horizontal lines, because the
 * shape that matters is not "did the number go up" - it is how close you are to
 * the line you'd hate to fall back under.
 */
export function RpChart({ days, height = 150 }: { days: DayRecord[]; height?: number }) {
  if (days.length < 2) {
    return (
      <div
        className="grid place-items-center rounded-2xl border border-[color:var(--color-line)] text-xs text-[color:var(--color-ink-faint)]"
        style={{ height }}
      >
        Two days of history and this fills in.
      </div>
    );
  }

  const width = 400;
  const pad = 4;
  const values = days.map((d) => d.rpAfter);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // Always show at least a 200 RP band so a flat week doesn't look like chaos.
  const mid = (rawMin + rawMax) / 2;
  const span = Math.max(200, rawMax - rawMin);
  const min = mid - span / 2;
  const max = mid + span / 2;

  const x = (i: number) => pad + (i / (days.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / (max - min)) * (height - pad * 2);

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(values.length - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`;

  const last = values[values.length - 1];
  const rising = last >= values[0];
  const stroke = rising ? 'var(--color-gain)' : 'var(--color-burn)';

  const floors = TIERS.filter((t) => t.floor > min && t.floor < max);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} role="img" aria-label="RP over the season">
      <defs>
        <linearGradient id="rp-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>

      {floors.map((tier) => (
        <g key={tier.name}>
          <line
            x1={pad}
            x2={width - pad}
            y1={y(tier.floor)}
            y2={y(tier.floor)}
            stroke={tier.color}
            strokeOpacity="0.28"
            strokeDasharray="3 4"
          />
          <text x={pad + 2} y={y(tier.floor) - 3} fill={tier.color} fillOpacity="0.6" fontSize="8">
            {tier.name}
          </text>
        </g>
      ))}

      <path d={area} fill="url(#rp-fill)" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r="3.5" fill={stroke} />
    </svg>
  );
}
