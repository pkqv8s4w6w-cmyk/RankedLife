/**
 * Core domain types for Ranked Life.
 *
 * The whole app state is one JSON document. It is small (a year of heavy
 * logging is a few hundred KB), which lets us keep persistence trivial:
 * write it to localStorage immediately, push it to the sync endpoint on a
 * debounce. No ORM, no migrations beyond a version bump.
 */

export type Polarity = 'build' | 'burn';

/**
 * How an activity is measured. This decides what the amount field means and
 * how raw points are derived from it.
 *  - check:    done / not done. amount is always 1.
 *  - duration: amount is minutes. `points` is per 30 minutes.
 *  - count:    amount is a unit count (pages, reps, problems). `points` is per unit.
 *  - money:    amount is dollars. `points` is per $10 (used for burns).
 */
export type ActivityKind = 'check' | 'duration' | 'count' | 'money';

/**
 * Friction is the user's own rating of how much they dread the activity.
 * It is the lever that makes a math assignment worth more than an hour on a
 * side project they already enjoy. It also quietly guards against the
 * overjustification effect: things you already love get a *smaller*
 * multiplier, so the app is not paying you to do what you'd do anyway.
 */
export type Friction = 1 | 2 | 3 | 4 | 5;

export interface Activity {
  id: string;
  name: string;
  emoji: string;
  polarity: Polarity;
  kind: ActivityKind;
  /** Display unit, e.g. 'min', 'pages', 'reps', '$'. */
  unit?: string;
  /** Points per standard unit. Always stored positive; burns are negated at scoring time. */
  points: number;
  friction: Friction;
  /**
   * Points from this single activity that earn full credit in one day.
   * Past it, returns diminish hard. This is the main defence against
   * Goodhart's law: you cannot farm one cheap task all day.
   */
  softCap: number;
  /** Implementation intention: "if <cue>, then I do this". Gollwitzer if-then plan. */
  cue?: string;
  /** Shown as a quick-tap tile on the Today screen. */
  pinned: boolean;
  archived: boolean;
  /** Preset amounts offered as one-tap chips, e.g. [30, 60, 90] minutes. */
  presets?: number[];
  createdAt: number;
}

export interface Crit {
  multiplier: number;
  label: string;
  /** Extra points the crit added, after the daily crit cap was applied. */
  bonus: number;
}

export interface LogEntry {
  id: string;
  /** Local calendar day this entry counts toward, 'YYYY-MM-DD'. */
  dateKey: string;
  activityId: string;
  /** Raw user-supplied amount in the activity's own units. */
  amount: number;
  /** Final signed points, frozen at log time so history never silently changes. */
  points: number;
  /** Points before diminishing returns, escalation and crits. Kept for the breakdown UI. */
  rawPoints: number;
  crit?: Crit;
  /** Set when the entry was backfilled for an earlier day, at reduced credit. */
  backfillFactor?: number;
  note?: string;
  source: 'tap' | 'ai' | 'manual';
  createdAt: number;
}

export type DayOutcome = 'cleared' | 'missed' | 'shielded' | 'placement' | 'rest';

export interface DayRecord {
  dateKey: string;
  score: number;
  par: number;
  rpDelta: number;
  rpAfter: number;
  outcome: DayOutcome;
  /** RP added on top of the base delta: quests, streak, penalty-box halving, etc. */
  modifiers: { label: string; value: number }[];
  questsCompleted: number;
  closedAt: number;
}

export type QuestKind =
  | 'do_activity'
  | 'clean_day'
  | 'beat_par'
  | 'volume'
  | 'high_friction';

export interface Quest {
  id: string;
  kind: QuestKind;
  label: string;
  /** Activity this quest targets, when applicable. */
  activityId?: string;
  /** Target amount in the quest's own terms (points, minutes, count). */
  target: number;
  reward: number;
  done: boolean;
}

export interface Wager {
  id: string;
  /** What you are committing to, phrased as an if-then plan. */
  promise: string;
  dueDateKey: string;
  /** RP put up as collateral. Lost if the wager is not honoured. */
  stake: number;
  /** A real-world forfeit the user writes themselves. */
  forfeit?: string;
  status: 'open' | 'won' | 'lost';
  createdAt: number;
  resolvedAt?: number;
}

export interface PenaltyBox {
  /** The day whose collapse triggered this. */
  sinceDateKey: string;
  /** The make-up the user owes before normal RP gain resumes. */
  task: string;
  cleared: boolean;
}

export interface Settings {
  /** Hour (0-23) at which a new day starts. Lets night owls log past midnight. */
  dayRolloverHour: number;
  /** Starting par used before there is enough history to compute one. */
  baselinePar: number;
  /** Automatically spend a shield rather than taking an RP loss. */
  autoShield: boolean;
  /** Enable the penalty box after a collapsed day. */
  penaltyBoxEnabled: boolean;
  /** Fraction of par below which a day counts as a collapse. */
  collapseRatio: number;
  gate: {
    enabled: boolean;
    /** Points you must bank before the gate opens. */
    threshold: number;
    /** Domains the browser extension blocks while the gate is shut. */
    sites: string[];
    /** Gate is always open before this hour, so mornings aren't hostile. */
    openBeforeHour: number;
  };
  /** Opaque token shared with the sync endpoint and the gate endpoint. */
  syncKey?: string;
}

export interface Profile {
  rp: number;
  peakRp: number;
  /** Consecutive days with at least one entry. Damaged, never zeroed, by a miss. */
  streak: number;
  longestStreak: number;
  shields: number;
  maxShields: number;
  /** Days logged since the last shield was granted. */
  shieldProgress: number;
  /** Non-crit build entries since the last crit. Drives the pity timer. */
  critPity: number;
  seasonId: number;
  seasonStartKey: string;
  /** Days remaining in placements. Placements cannot lose RP. */
  placementsLeft: number;
  /** Set while demotion protection is active; RP cannot fall past a tier floor. */
  demotionShieldUntilKey?: string;
  /** Last day that was rolled up into a DayRecord. */
  lastClosedKey?: string;
  createdAt: number;
}

export interface AppState {
  version: number;
  /** Monotonic revision counter used for last-write-wins sync. */
  rev: number;
  updatedAt: number;
  profile: Profile;
  activities: Activity[];
  entries: LogEntry[];
  days: Record<string, DayRecord>;
  quests: Record<string, Quest[]>;
  wagers: Wager[];
  penaltyBox?: PenaltyBox;
  settings: Settings;
  /** Cleared once the user finishes onboarding. */
  onboarded: boolean;
}

/** Shape returned by the natural-language parser before the user confirms it. */
export interface ParsedItem {
  activityId: string | null;
  /** Used when activityId is null, so we can offer to create the activity. */
  suggestedName?: string;
  suggestedPolarity?: Polarity;
  amount: number;
  note?: string;
  confidence: number;
}
