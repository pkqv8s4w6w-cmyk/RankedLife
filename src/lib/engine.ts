/**
 * The engine. Everything that changes rank lives here.
 *
 * The one rule this file exists to enforce: a day is only ever settled once,
 * and once settled it is frozen. Scores, par and RP deltas are written into a
 * DayRecord and never recomputed, so tweaking an activity's point value today
 * can't silently rewrite last month's rank history.
 */

import type {
  Activity,
  AppState,
  DayOutcome,
  DayRecord,
  LogEntry,
  Profile,
  Quest,
} from './types';
import { addDays, daysBetween, todayKey } from './dates';
import { applyRp, softReset, STARTING_RP } from './rank';
import { computePar, rpForDay } from './par';
import { evaluateQuests, generateQuests, questReward } from './quests';
import { buildContext, round1, scoreEntry, totalPoints } from './scoring';

export const SEASON_DAYS = 66; // Lally et al. median time to automaticity
export const PLACEMENT_DAYS = 5;
export const BACKFILL_WINDOW_DAYS = 2;
export const BACKFILL_FACTOR = 0.7;
export const SHIELD_EVERY_N_DAYS = 7;
/** RP lost for each day you simply didn't show up. */
export const GHOST_DAY_RP = -18;
/**
 * RP lost per keystone you left undone on a day you did log.
 *
 * Deliberately smaller than a missed day: this is "you skipped the thing that
 * was already due", not "you vanished". It also never applies to a day you
 * never opened at all, since GHOST_DAY_RP has already covered that.
 */
export const KEYSTONE_MISS_RP = -8;
/** Cap on how much a single catch-up can cost, so a rough week isn't fatal. */
export const GHOST_CATCHUP_FLOOR = -50;
/** Streak damage per missed day. Damaged, never zeroed - one miss doesn't undo a habit. */
export const STREAK_DAMAGE_PER_MISS = 3;

export function entriesForDay(state: AppState, dateKey: string): LogEntry[] {
  return state.entries.filter((e) => e.dateKey === dateKey);
}

export function dayScore(state: AppState, dateKey: string): number {
  return totalPoints(entriesForDay(state, dateKey));
}

/** Par for a day: frozen if the day is closed, computed live otherwise. */
export function parForDay(state: AppState, dateKey: string): number {
  const closed = state.days[dateKey];
  if (closed) return closed.par;

  const history = Object.values(state.days).filter((d) => d.dateKey < dateKey);
  const previous = state.days[addDays(dateKey, -1)]?.par;
  return computePar({ history, baselinePar: state.settings.baselinePar, previousPar: previous });
}

/** Live keystone activities - the day's non-negotiables. */
export function keystonesFor(state: AppState): Activity[] {
  return state.activities.filter((a) => a.keystone && !a.archived && a.polarity === 'build');
}

/** Keystones with nothing logged against them on the given day. */
export function missedKeystones(state: AppState, dateKey: string): Activity[] {
  const logged = new Set(entriesForDay(state, dateKey).map((e) => e.activityId));
  return keystonesFor(state).filter((a) => !logged.has(a.id));
}

export function questsForDay(state: AppState, dateKey: string): Quest[] {
  const stored = state.quests[dateKey];
  const base = stored ?? generateQuests(dateKey, state.activities, parForDay(state, dateKey));
  return evaluateQuests(base, entriesForDay(state, dateKey), state.activities, dayScore(state, dateKey));
}

/** Add an entry, scoring it against whatever is already logged that day. */
export function addEntry(
  state: AppState,
  input: { activityId: string; amount: number; dateKey: string; note?: string; source: LogEntry['source'] },
): { state: AppState; entry: LogEntry | null } {
  const activity = state.activities.find((a) => a.id === input.activityId);
  if (!activity) return { state, entry: null };

  const today = todayKey(state.settings.dayRolloverHour);
  const age = daysBetween(input.dateKey, today);
  if (age > BACKFILL_WINDOW_DAYS || age < 0) return { state, entry: null };
  if (state.days[input.dateKey]) return { state, entry: null }; // already settled

  const backfillFactor = age > 0 ? BACKFILL_FACTOR : 1;
  const existing = entriesForDay(state, input.dateKey);
  const ctx = buildContext(existing, state.activities);
  ctx.pity = state.profile.critPity;

  const id = makeId();
  const scored = scoreEntry(id, activity, input.amount, ctx, backfillFactor);

  const entry: LogEntry = {
    id,
    dateKey: input.dateKey,
    activityId: activity.id,
    amount: input.amount,
    points: scored.points,
    rawPoints: scored.rawPoints,
    crit: scored.crit,
    backfillFactor: age > 0 ? BACKFILL_FACTOR : undefined,
    note: input.note,
    source: input.source,
    createdAt: Date.now(),
  };

  return {
    state: {
      ...state,
      entries: [...state.entries, entry],
      profile: { ...state.profile, critPity: scored.nextPity },
    },
    entry,
  };
}

export function removeEntry(state: AppState, entryId: string): AppState {
  const entry = state.entries.find((e) => e.id === entryId);
  // Settled days are immutable.
  if (!entry || state.days[entry.dateKey]) return state;
  return { ...state, entries: state.entries.filter((e) => e.id !== entryId) };
}

export interface CloseResult {
  record: DayRecord;
  profile: Profile;
  events: string[];
}

/**
 * Settle one day. Pure: takes the state and a day, returns the record and the
 * profile that results. `closeThrough` drives this for every open day.
 */
export function closeDay(state: AppState, dateKey: string): CloseResult {
  const profile = { ...state.profile };
  const events: string[] = [];
  const entries = entriesForDay(state, dateKey);
  const score = totalPoints(entries);
  const par = parForDay(state, dateKey);
  const logged = entries.length > 0;

  const quests = questsForDay(state, dateKey);
  const questsCompleted = quests.filter((q) => q.done).length;

  const modifiers: { label: string; value: number }[] = [];
  let outcome: DayOutcome;
  let delta: number;

  if (!logged) {
    // Nothing logged at all. This is the one that actually stings, and it is
    // meant to: the app only works if opening it is non-negotiable.
    outcome = 'missed';
    delta = GHOST_DAY_RP;
    profile.streak = Math.max(0, profile.streak - STREAK_DAMAGE_PER_MISS);
    events.push(`No entry for ${dateKey}.`);
  } else {
    delta = rpForDay(score, par);
    profile.streak += 1;
    profile.longestStreak = Math.max(profile.longestStreak, profile.streak);
    profile.shieldProgress += 1;

    const questRp = questReward(quests);
    if (questRp > 0) modifiers.push({ label: 'Quests', value: questRp });

    const streakBonus = Math.min(8, Math.floor(profile.streak / 5));
    if (streakBonus > 0) modifiers.push({ label: `Streak ${profile.streak}`, value: streakBonus });

    // The floor. Skipping something that was already due costs RP on top of the
    // points you didn't earn, which is what separates an obligation from an
    // opportunity.
    for (const activity of missedKeystones(state, dateKey)) {
      modifiers.push({ label: `Skipped: ${activity.name}`, value: KEYSTONE_MISS_RP });
    }

    // `outcome` stays a statement about par, because that is what it means
    // everywhere it is read. A skipped keystone shows up as its own modifier
    // line instead, so a 70-point day never gets labelled "under par".
    outcome = score >= par ? 'cleared' : 'missed';
  }

  // The penalty box halves gains until the make-up is cleared. It never turns a
  // gain into a loss - the point is to slow you down, not to bury you.
  if (state.penaltyBox && !state.penaltyBox.cleared && delta > 0) {
    const cut = -Math.round(delta * 0.5);
    modifiers.push({ label: 'Penalty box', value: cut });
  }

  let total = delta + modifiers.reduce((s, m) => s + m.value, 0);

  // Placements: you cannot lose RP while being placed. Early guaranteed wins
  // are what build the self-efficacy that carries you through later bad weeks.
  if (profile.placementsLeft > 0) {
    if (total < 0) {
      modifiers.push({ label: 'Placement protection', value: -total });
      total = 0;
    }
    outcome = 'placement';
    profile.placementsLeft -= 1;
    if (profile.placementsLeft === 0) events.push('Placements complete.');
  } else if (total < 0 && profile.shields > 0 && shouldSpendShield(state, score, par)) {
    // Emergency reserve. Absorbs the loss but never converts it to a gain, so
    // there is a real cost to spending one and you'll hoard them.
    profile.shields -= 1;
    modifiers.push({ label: 'Shield spent', value: -total });
    total = 0;
    outcome = 'shielded';
    events.push(`Shield spent. ${profile.shields} left.`);
  }

  const protectionActive =
    !!profile.demotionShieldUntilKey && profile.demotionShieldUntilKey >= dateKey;
  const applied = applyRp(profile.rp, total, protectionActive);
  const actualDelta = applied.rp - profile.rp;

  profile.rp = applied.rp;
  profile.peakRp = Math.max(profile.peakRp, profile.rp);

  if (applied.protectionUsed) {
    profile.demotionShieldUntilKey = addDays(dateKey, 2);
    events.push('Demotion protection active for 2 days.');
  } else if (applied.demoted) {
    profile.demotionShieldUntilKey = undefined;
    events.push('Demoted.');
  } else if (total > 0) {
    profile.demotionShieldUntilKey = undefined;
  }

  // Shields regenerate on consistency, not on time.
  if (profile.shieldProgress >= SHIELD_EVERY_N_DAYS && profile.shields < profile.maxShields) {
    profile.shields += 1;
    profile.shieldProgress = 0;
    events.push('Shield earned.');
  }

  profile.lastClosedKey = dateKey;

  const record: DayRecord = {
    dateKey,
    score,
    par,
    rpDelta: actualDelta,
    rpAfter: profile.rp,
    outcome,
    modifiers,
    questsCompleted,
    closedAt: Date.now(),
  };

  return { record, profile, events };
}

/**
 * A shield is only worth spending on a day you genuinely showed up for.
 * Burning one on a day you ignored entirely would make them meaningless.
 */
function shouldSpendShield(state: AppState, score: number, par: number): boolean {
  if (!state.settings.autoShield) return false;
  return score > 0 && score >= par * 0.35;
}

export interface CatchUpResult {
  state: AppState;
  closed: DayRecord[];
  events: string[];
}

/**
 * Settle every day before today that is still open, then roll the season and
 * penalty box forward. Called on app load and whenever the day flips.
 */
export function catchUp(state: AppState, now = new Date()): CatchUpResult {
  let working = state;
  const closed: DayRecord[] = [];
  const events: string[] = [];
  const today = todayKey(working.settings.dayRolloverHour);

  const start = working.profile.lastClosedKey
    ? addDays(working.profile.lastClosedKey, 1)
    : firstActiveKey(working);

  if (!start) return { state: working, closed, events };

  let cursor = start;
  let ghostCost = 0;
  let guard = 0;

  while (cursor < today && guard++ < 400) {
    const before = working.profile.rp;
    const result = closeDay(working, cursor);

    // Cap the total damage from one catch-up. Coming back after a bad week
    // should feel recoverable, otherwise nobody comes back.
    let record = result.record;
    let profile = result.profile;
    if (record.outcome === 'missed' && record.rpDelta < 0) {
      const wouldBe = ghostCost + record.rpDelta;
      if (wouldBe < GHOST_CATCHUP_FLOOR) {
        const allowed = Math.max(0, GHOST_CATCHUP_FLOOR - ghostCost);
        profile = { ...profile, rp: before - allowed, peakRp: profile.peakRp };
        record = { ...record, rpDelta: -allowed, rpAfter: profile.rp };
      }
      ghostCost += record.rpDelta;
    }

    working = {
      ...working,
      profile,
      days: { ...working.days, [cursor]: record },
      quests: { ...working.quests, [cursor]: questsForDay(working, cursor) },
    };
    closed.push(record);
    events.push(...result.events);
    cursor = addDays(cursor, 1);
  }

  working = rollSeason(working, today, events);
  working = rollPenaltyBox(working, today, events);

  // Make sure today has a quest set pinned down before it can drift.
  if (!working.quests[today]) {
    working = {
      ...working,
      quests: {
        ...working.quests,
        [today]: generateQuests(today, working.activities, parForDay(working, today)),
      },
    };
  }

  void now;
  return { state: working, closed, events };
}

function firstActiveKey(state: AppState): string | null {
  const keys = state.entries.map((e) => e.dateKey).sort();
  return keys[0] ?? null;
}

function rollSeason(state: AppState, today: string, events: string[]): AppState {
  const elapsed = daysBetween(state.profile.seasonStartKey, today);
  if (elapsed < SEASON_DAYS) return state;

  const profile: Profile = {
    ...state.profile,
    rp: softReset(state.profile.rp),
    seasonId: state.profile.seasonId + 1,
    seasonStartKey: today,
    placementsLeft: PLACEMENT_DAYS,
    shields: Math.min(state.profile.maxShields, state.profile.shields + 1),
    demotionShieldUntilKey: undefined,
  };
  events.push(`Season ${profile.seasonId} begins. Placements reset.`);
  return { ...state, profile };
}

/**
 * The penalty box. One collapsed day - a day that came in far under par -
 * leaves you owing a make-up before RP gains run at full rate again.
 */
function rollPenaltyBox(state: AppState, today: string, events: string[]): AppState {
  if (!state.settings.penaltyBoxEnabled) {
    return state.penaltyBox ? { ...state, penaltyBox: undefined } : state;
  }
  if (state.penaltyBox && !state.penaltyBox.cleared) return state;

  const yesterday = addDays(today, -1);
  const record = state.days[yesterday];
  if (!record) return state;
  if (record.outcome === 'shielded' || record.outcome === 'placement') return state;
  if (record.score >= record.par * state.settings.collapseRatio) {
    return state.penaltyBox?.cleared ? { ...state, penaltyBox: undefined } : state;
  }

  events.push('Penalty box: yesterday collapsed.');
  return {
    ...state,
    penaltyBox: {
      sinceDateKey: today,
      task: suggestMakeUp(state),
      cleared: false,
    },
  };
}

/**
 * Pick the make-up task. Highest-friction pinned activity, because the make-up
 * should be the thing you avoid, and it should be one concrete action rather
 * than a vague "do better".
 */
function suggestMakeUp(state: AppState): string {
  const candidates = state.activities
    .filter((a) => !a.archived && a.polarity === 'build')
    .sort((a, b) => b.friction - a.friction);
  const pick = candidates[0];
  return pick ? `Log ${pick.name} today` : 'Log one build activity today';
}

/** The penalty box clears itself once the owed activity shows up. */
export function refreshPenaltyBox(state: AppState): AppState {
  if (!state.penaltyBox || state.penaltyBox.cleared) return state;
  const today = todayKey(state.settings.dayRolloverHour);
  const entries = entriesForDay(state, today);
  const builds = entries.filter(
    (e) => state.activities.find((a) => a.id === e.activityId)?.polarity === 'build',
  );
  if (builds.length === 0) return state;
  return { ...state, penaltyBox: { ...state.penaltyBox, cleared: true } };
}

export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function freshProfile(startKey: string): Profile {
  return {
    rp: STARTING_RP, // endowed progress: you start on the ladder, not below it
    peakRp: STARTING_RP,
    streak: 0,
    longestStreak: 0,
    shields: 2,
    maxShields: 3,
    shieldProgress: 0,
    critPity: 0,
    seasonId: 1,
    seasonStartKey: startKey,
    placementsLeft: PLACEMENT_DAYS,
    createdAt: Date.now(),
  };
}

/**
 * Which single activity would most cheaply have covered a shortfall.
 *
 * `alreadyLogged` keeps it from suggesting a done/not-done thing you have
 * already ticked off, which would be both wrong and slightly insulting.
 */
export function bestLeverFor(
  activities: Activity[],
  gap: number,
  alreadyLogged: Set<string> = new Set(),
): string | undefined {
  const options = activities
    .filter((a) => !a.archived && a.polarity === 'build')
    .filter((a) => !(a.kind === 'check' && alreadyLogged.has(a.id)))
    .map((a) => {
      const perUnit = a.points * (a.kind === 'duration' ? 1 : 1);
      const unitsNeeded = Math.max(1, Math.ceil(gap / Math.max(0.1, perUnit)));
      const amount = a.kind === 'duration' ? unitsNeeded * 30 : unitsNeeded;
      return { activity: a, amount, effort: unitsNeeded * a.friction };
    })
    .sort((a, b) => a.effort - b.effort);

  const best = options[0];
  if (!best) return undefined;
  const suffix = best.activity.kind === 'check' ? '' : ` ${best.amount}${best.activity.unit ? ' ' + best.activity.unit : ''}`;
  return `${best.activity.name}${suffix}`;
}

export function round(n: number): number {
  return round1(n);
}
