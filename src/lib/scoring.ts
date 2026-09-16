/**
 * Turning "I went to the gym for 45 minutes" into a number.
 *
 * Three things happen to every entry, in order:
 *   1. Friction weighting  - the thing you dread is worth more than the thing
 *                            you'd do anyway. This is also the overjustification
 *                            guard: low-friction activities get a multiplier
 *                            below 1, so the app is not paying you for what you
 *                            already enjoy.
 *   2. Diminishing returns - repeated logging of the same activity in one day
 *                            decays hard. You cannot farm a cheap task.
 *   3. Crits               - a variable-ratio bonus. Fixed rewards stop
 *                            producing a reward-prediction error once the brain
 *                            predicts them; unpredictable ones don't.
 */

import type { Activity, Crit, LogEntry } from './types';
import { seeded } from './rng';

/**
 * Friction multipliers. Deliberately not linear and deliberately not huge:
 * a 5 is worth just over twice a 1, which is enough to make the dreaded thing
 * the obviously correct play without making everything else feel pointless.
 */
export const FRICTION_MULT: Record<number, number> = {
  1: 0.7,
  2: 0.85,
  3: 1.0,
  4: 1.25,
  5: 1.55,
};

export const FRICTION_LABEL: Record<number, string> = {
  1: 'Enjoy it',
  2: 'Easy',
  3: 'Neutral',
  4: 'Resist it',
  5: 'Dread it',
};

/** Points earned before diminishing returns start biting, expressed as slices. */
const DECAY_STEPS = [1, 0.5, 0.25, 0.1];
const DECAY_TAIL = 0.05;

/** Crit table. Rarer rolls pay more. */
const CRIT_TABLE: { p: number; multiplier: number; label: string }[] = [
  { p: 0.55, multiplier: 1.5, label: 'Crit' },
  { p: 0.32, multiplier: 2.0, label: 'Double' },
  { p: 0.1, multiplier: 2.5, label: 'Rampage' },
  { p: 0.03, multiplier: 3.0, label: 'Legendary' },
];

const CRIT_BASE_CHANCE = 0.1;
const CRIT_PITY_STEP = 0.06;
const CRIT_MAX_CHANCE = 0.45;
/** An entry must be worth this much before it can crit, so you can't farm rolls. */
const CRIT_MIN_POINTS = 3;
/** Crits can add at most this fraction of the day's pre-crit build total. */
const CRIT_DAY_CAP_RATIO = 0.4;

/** Convert a user-facing amount into standard units for the activity's kind. */
export function standardUnits(activity: Activity, amount: number): number {
  switch (activity.kind) {
    case 'check':
      return 1;
    case 'duration':
      return amount / 30; // points are per 30 minutes
    case 'money':
      return amount / 10; // points are per $10
    case 'count':
    default:
      return amount;
  }
}

/** Points for one entry before any same-day decay, always positive. */
export function rawPointsFor(activity: Activity, amount: number): number {
  const units = standardUnits(activity, Math.max(0, amount));
  const mult = activity.polarity === 'build' ? FRICTION_MULT[activity.friction] ?? 1 : 1;
  return activity.points * units * mult;
}

/**
 * Apply diminishing returns across the slice of points being added.
 *
 * `alreadyEarned` is the raw total this activity has produced today. The first
 * `softCap` points are full value, the next `softCap` are worth half, then a
 * quarter, then a tenth, then a flat 5%.
 */
export function diminish(alreadyEarned: number, adding: number, softCap: number): number {
  if (softCap <= 0) return adding;
  let remaining = adding;
  let cursor = alreadyEarned;
  let credited = 0;

  while (remaining > 0.0001) {
    const stepIndex = Math.floor(cursor / softCap);
    const rate = stepIndex < DECAY_STEPS.length ? DECAY_STEPS[stepIndex] : DECAY_TAIL;
    const roomInStep = softCap * (stepIndex + 1) - cursor;
    const take = Math.min(remaining, roomInStep > 0 ? roomInStep : softCap);
    credited += take * rate;
    cursor += take;
    remaining -= take;
  }
  return credited;
}

/**
 * Repeated burns escalate instead of decaying. The third impulse purchase of
 * the day should hurt more than the first, not less.
 */
export function escalate(priorCount: number): number {
  return Math.min(2, 1 + priorCount * 0.25);
}

export interface CritRoll {
  crit: Crit | null;
  /** Pity counter to store back on the profile. */
  nextPity: number;
}

/**
 * Roll a crit for an entry.
 *
 * Seeded from the entry id, so the roll is fixed the moment the entry exists.
 * The pity counter raises the odds after every dry entry, which keeps the
 * schedule variable without letting long droughts kill the feel.
 */
export function rollCrit(
  entryId: string,
  points: number,
  pity: number,
  critHeadroom: number,
): CritRoll {
  if (points < CRIT_MIN_POINTS || critHeadroom <= 0) {
    return { crit: null, nextPity: pity };
  }

  const rand = seeded(`crit:${entryId}`);
  const chance = Math.min(CRIT_MAX_CHANCE, CRIT_BASE_CHANCE + pity * CRIT_PITY_STEP);
  if (rand() >= chance) {
    return { crit: null, nextPity: pity + 1 };
  }

  const roll = rand();
  let acc = 0;
  let picked = CRIT_TABLE[0];
  for (const row of CRIT_TABLE) {
    acc += row.p;
    if (roll <= acc) {
      picked = row;
      break;
    }
  }

  const wanted = points * (picked.multiplier - 1);
  const bonus = Math.min(wanted, critHeadroom);
  if (bonus < 0.5) return { crit: null, nextPity: pity + 1 };

  return {
    crit: { multiplier: picked.multiplier, label: picked.label, bonus: round1(bonus) },
    nextPity: 0,
  };
}

/** Headroom left for crit bonuses today, given what's already been granted. */
export function critHeadroom(buildTotalBeforeCrits: number, critBonusSoFar: number): number {
  return Math.max(0, buildTotalBeforeCrits * CRIT_DAY_CAP_RATIO - critBonusSoFar);
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface ScoreContext {
  /** Raw points already logged today, keyed by activity id. */
  earnedByActivity: Record<string, number>;
  /** Entry counts today, keyed by activity id. Used for burn escalation. */
  countByActivity: Record<string, number>;
  buildTotalBeforeCrits: number;
  critBonusSoFar: number;
  pity: number;
}

export function buildContext(entries: LogEntry[], activities: Activity[]): ScoreContext {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const ctx: ScoreContext = {
    earnedByActivity: {},
    countByActivity: {},
    buildTotalBeforeCrits: 0,
    critBonusSoFar: 0,
    pity: 0,
  };
  for (const e of entries) {
    ctx.earnedByActivity[e.activityId] = (ctx.earnedByActivity[e.activityId] ?? 0) + e.rawPoints;
    ctx.countByActivity[e.activityId] = (ctx.countByActivity[e.activityId] ?? 0) + 1;
    const a = byId.get(e.activityId);
    if (a?.polarity === 'build') {
      ctx.buildTotalBeforeCrits += Math.max(0, e.points - (e.crit?.bonus ?? 0));
      ctx.critBonusSoFar += e.crit?.bonus ?? 0;
    }
  }
  return ctx;
}

export interface ScoredEntry {
  points: number;
  rawPoints: number;
  crit?: Crit;
  nextPity: number;
}

/**
 * Score a single new entry against the day so far.
 *
 * `backfillFactor` is below 1 when logging a day late, so catching up is
 * always worth doing but never as good as logging on the day.
 */
export function scoreEntry(
  entryId: string,
  activity: Activity,
  amount: number,
  ctx: ScoreContext,
  backfillFactor = 1,
): ScoredEntry {
  const raw = rawPointsFor(activity, amount);

  if (activity.polarity === 'burn') {
    const mult = escalate(ctx.countByActivity[activity.id] ?? 0);
    const points = -round1(raw * mult * backfillFactor);
    return { points, rawPoints: round1(raw), nextPity: ctx.pity };
  }

  const credited =
    diminish(ctx.earnedByActivity[activity.id] ?? 0, raw, activity.softCap) * backfillFactor;

  const headroom = critHeadroom(ctx.buildTotalBeforeCrits + credited, ctx.critBonusSoFar);
  const { crit, nextPity } = rollCrit(entryId, credited, ctx.pity, headroom);

  const points = round1(credited + (crit?.bonus ?? 0));
  return { points, rawPoints: round1(raw), crit: crit ?? undefined, nextPity };
}

/** Sum of an entry list. */
export function totalPoints(entries: LogEntry[]): number {
  return round1(entries.reduce((sum, e) => sum + e.points, 0));
}
