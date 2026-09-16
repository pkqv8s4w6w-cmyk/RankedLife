'use client';

import { rankFor } from '@/lib/rank';
import { RankBadge } from './RankBadge';
import { useStore } from '@/lib/store';

/**
 * Rank, RP bar, streak and shields. This is the first thing on screen because
 * it is the thing you have to lose - everything below it is just how you keep it.
 */
export function RankHeader() {
  const { state } = useStore();
  const { profile } = state;
  const rank = rankFor(profile.rp);
  const inPlacements = profile.placementsLeft > 0;

  return (
    <div className="flex items-center gap-3">
      <RankBadge rp={profile.rp} size={52} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-lg font-semibold" style={{ color: rank.color }}>
            {inPlacements ? 'Unranked' : rank.label}
          </span>
          <span className="num text-xs text-[color:var(--color-ink-faint)]">
            {inPlacements ? `${profile.placementsLeft} to place` : `${profile.rp} RP`}
          </span>
        </div>

        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color:var(--color-line)]">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{
              width: `${Math.max(3, rank.progress * 100)}%`,
              background: `linear-gradient(90deg, ${rank.color}, ${rank.glow})`,
              boxShadow: `0 0 10px ${rank.color}88`,
            }}
          />
        </div>

        <div className="mt-1 flex items-center gap-3 text-[11px] text-[color:var(--color-ink-faint)]">
          {rank.rpToNext !== null && !inPlacements && (
            <span className="num">
              {rank.rpToNext} to {rank.nextLabel}
            </span>
          )}
          <span className="num" title="Consecutive days logged">
            🔥 {profile.streak}
          </span>
          <span className="num" title="Emergency reserves. Absorb one bad day each.">
            🛡 {profile.shields}/{profile.maxShields}
          </span>
        </div>
      </div>
    </div>
  );
}
