/**
 * Par: the score you have to beat today.
 *
 * Par is your own trailing median, not a number someone else picked. That
 * matters for two reasons. It is criterion-referenced, which the negative
 * feedback research says is the version that doesn't wreck motivation. And it
 * is self-correcting against Goodhart's law: if you inflate your score by
 * farming easy wins, par rises to meet you and the inflation buys you nothing.
 *
 * Early on there isn't enough history, so par ramps up from a fraction of your
 * stated baseline. That is deliberate endowed progress - the first few days
 * are winnable on purpose.
 */

import type { DayRecord } from './types';

export const PAR_WINDOW = 14;
export const MIN_PAR = 12;
/** Gentle progressive overload on top of the median. */
const GROWTH = 1.03;
/** Par can't move more than this much in a day, in either direction. */
const MAX_DROP = 0.9;
const MAX_RISE = 1.12;

/** Ramp applied to baseline par while history is still thin. */
const RAMP = [0.5, 0.55, 0.65, 0.75, 0.85];

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface ParInput {
  /** Closed day records, any order. */
  history: DayRecord[];
  baselinePar: number;
  /** Par used for the previous day, if there was one. */
  previousPar?: number;
}

export function computePar({ history, baselinePar, previousPar }: ParInput): number {
  // Rest days are excluded so a deliberate day off doesn't drag par down and
  // hand you a free week of easy targets afterwards.
  const scored = history
    .filter((d) => d.outcome !== 'rest')
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  if (scored.length < RAMP.length) {
    const ramp = RAMP[scored.length] ?? 1;
    return Math.max(MIN_PAR, Math.round(baselinePar * ramp));
  }

  const window = scored.slice(-PAR_WINDOW).map((d) => d.score);
  let par = median(window) * GROWTH;

  if (previousPar && previousPar > 0) {
    par = Math.min(previousPar * MAX_RISE, Math.max(previousPar * MAX_DROP, par));
  }

  return Math.max(MIN_PAR, Math.round(par));
}

/**
 * RP earned or lost for a day, before modifiers.
 *
 * Hitting par exactly is a gain, not a wash. Showing up and matching your own
 * baseline is the behaviour the whole system exists to reinforce; if that paid
 * nothing, consistency would feel like treading water. Rank inflation is
 * handled by par itself rising, not by making a normal day feel bad.
 */
export function rpForDay(score: number, par: number): number {
  const safePar = Math.max(1, par);
  const ratio = score / safePar;

  if (ratio >= 1) {
    const over = Math.min(1, (ratio - 1) / 0.6);
    return 10 + Math.round(30 * over); // +10 .. +40
  }
  const under = Math.min(1, (1 - ratio) / 0.7);
  return -(6 + Math.round(30 * under)); // -6 .. -36
}

/**
 * The actionable half of negative feedback. The meta-analysis is clear that
 * criticism only avoids damaging motivation when it comes with a specific,
 * correctable instruction, so never show a loss without one of these.
 */
export function shortfallAdvice(score: number, par: number, bestLever?: string): string {
  const gap = Math.max(0, par - score);
  if (gap === 0) return 'You cleared par.';
  const rounded = Math.ceil(gap);
  if (bestLever) return `${rounded} points short. ${bestLever} would have covered it.`;
  return `${rounded} points short of par.`;
}
