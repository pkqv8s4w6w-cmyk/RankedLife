/**
 * The ranked ladder.
 *
 * This is the reason the app is called Ranked Life. Points are the currency;
 * rank is the thing you actually care about losing. Loss aversion does the
 * heavy lifting here, which is exactly why demotion has to be real but
 * recoverable: a rank you can never fall out of stops meaning anything, and a
 * rank that collapses on one bad day just teaches you to quit.
 */

export interface Tier {
  name: string;
  floor: number;
  color: string;
  /** Second colour for the badge gradient. */
  glow: string;
  divisions: number;
}

export const TIERS: Tier[] = [
  { name: 'Iron', floor: 0, color: '#64748b', glow: '#94a3b8', divisions: 3 },
  { name: 'Bronze', floor: 600, color: '#c2703f', glow: '#e79a63', divisions: 3 },
  { name: 'Silver', floor: 1200, color: '#9fb3c8', glow: '#dbe7f3', divisions: 3 },
  { name: 'Gold', floor: 1800, color: '#f5c542', glow: '#ffe89a', divisions: 3 },
  { name: 'Platinum', floor: 2500, color: '#2ed3c4', glow: '#8ff5ec', divisions: 3 },
  { name: 'Diamond', floor: 3300, color: '#8b7cf6', glow: '#c4b9ff', divisions: 3 },
  { name: 'Ascendant', floor: 4200, color: '#2ee86b', glow: '#9dffc2', divisions: 3 },
  { name: 'Immortal', floor: 5200, color: '#ff3d7f', glow: '#ff9dc2', divisions: 3 },
  { name: 'Apex', floor: 6300, color: '#ffffff', glow: '#7df9ff', divisions: 1 },
];

/** RP you are placed at when you start. Endowed progress: never start at zero. */
export const STARTING_RP = 660;
export const RP_MIN = 0;
export const RP_MAX = 9999;

export interface RankInfo {
  tier: Tier;
  tierIndex: number;
  /** 1 is the highest division inside a tier, matching ranked-game convention. */
  division: number;
  /** e.g. "Gold II", or just "Apex" for the single-division top tier. */
  label: string;
  /** 0..1 progress through the current division. */
  progress: number;
  /** RP at which the current division began. */
  divisionFloor: number;
  divisionCeil: number;
  /** RP that would drop you out of the current tier entirely. */
  tierFloor: number;
  nextLabel: string | null;
  rpToNext: number | null;
  color: string;
  glow: string;
}

function tierCeil(index: number): number {
  return index + 1 < TIERS.length ? TIERS[index + 1].floor : RP_MAX + 1;
}

export function tierIndexForRp(rp: number): number {
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (rp >= TIERS[i].floor) idx = i;
  }
  return idx;
}

export function rankFor(rp: number): RankInfo {
  const clamped = Math.max(RP_MIN, Math.min(RP_MAX, Math.round(rp)));
  const tierIndex = tierIndexForRp(clamped);
  const tier = TIERS[tierIndex];
  const ceil = tierCeil(tierIndex);
  const span = (ceil - tier.floor) / tier.divisions;

  const rawDiv = Math.floor((clamped - tier.floor) / span);
  const divSlot = Math.min(tier.divisions - 1, Math.max(0, rawDiv));
  // Slot 0 is the bottom of the tier, which is the *highest* numeral.
  const division = tier.divisions - divSlot;

  const divisionFloor = tier.floor + divSlot * span;
  const divisionCeil = divisionFloor + span;
  const progress = Math.max(0, Math.min(1, (clamped - divisionFloor) / span));

  const label = tier.divisions === 1 ? tier.name : `${tier.name} ${roman(division)}`;

  let nextLabel: string | null = null;
  let rpToNext: number | null = null;
  if (clamped < RP_MAX) {
    const nextRp = Math.ceil(divisionCeil);
    if (nextRp <= RP_MAX) {
      nextLabel = labelForRp(nextRp);
      rpToNext = Math.max(1, nextRp - clamped);
    }
  }

  return {
    tier,
    tierIndex,
    division,
    label,
    progress,
    divisionFloor,
    divisionCeil,
    tierFloor: tier.floor,
    nextLabel,
    rpToNext,
    color: tier.color,
    glow: tier.glow,
  };
}

export function labelForRp(rp: number): string {
  const clamped = Math.max(RP_MIN, Math.min(RP_MAX, Math.round(rp)));
  const tierIndex = tierIndexForRp(clamped);
  const tier = TIERS[tierIndex];
  if (tier.divisions === 1) return tier.name;
  const span = (tierCeil(tierIndex) - tier.floor) / tier.divisions;
  const slot = Math.min(tier.divisions - 1, Math.floor((clamped - tier.floor) / span));
  return `${tier.name} ${roman(tier.divisions - slot)}`;
}

function roman(n: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V'][n] ?? String(n);
}

/** True when applying `delta` would drop you out of your current tier. */
export function wouldDemote(rp: number, delta: number): boolean {
  if (delta >= 0) return false;
  const before = tierIndexForRp(rp);
  const after = tierIndexForRp(Math.max(RP_MIN, rp + delta));
  return after < before;
}

/**
 * Apply an RP change with demotion protection.
 *
 * The first time a loss would knock you out of a tier, it is clipped to the
 * tier floor instead and a protection flag is set. Fall again while it is
 * active and you actually drop. This is the standard ranked-game treatment and
 * it maps cleanly onto the research: a lapse should cost something, but it
 * should not be the thing that ends your run.
 */
export function applyRp(
  rp: number,
  delta: number,
  protectionActive: boolean,
): { rp: number; demoted: boolean; protectionUsed: boolean } {
  const target = rp + delta;
  if (delta < 0 && wouldDemote(rp, delta) && !protectionActive) {
    return { rp: TIERS[tierIndexForRp(rp)].floor, demoted: false, protectionUsed: true };
  }
  const next = Math.max(RP_MIN, Math.min(RP_MAX, Math.round(target)));
  return {
    rp: next,
    demoted: tierIndexForRp(next) < tierIndexForRp(rp),
    protectionUsed: false,
  };
}

/**
 * Season soft reset. Compresses everyone toward the middle so a new season is
 * a genuine fresh start with something to climb back to, rather than either a
 * total wipe or no reset at all.
 */
export function softReset(rp: number): number {
  const ANCHOR = 1250; // low Silver
  return Math.round(rp * 0.6 + ANCHOR * 0.4);
}
