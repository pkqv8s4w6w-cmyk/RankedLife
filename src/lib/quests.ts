/**
 * Daily quests.
 *
 * Three small objectives, drawn fresh each day from your own activity list.
 * They exist to do two jobs: keep the reward schedule variable (you don't know
 * what tomorrow asks for), and push you toward the high-friction things you'd
 * otherwise skip. Rewards are small on purpose - quests are a nudge, not the
 * main event, and stacking big bonuses on them would just create a second
 * metric to game.
 */

import type { Activity, LogEntry, Quest } from './types';
import { sampleSeeded, seeded } from './rng';
import { standardUnits } from './scoring';

export const ALL_QUESTS_BONUS = 5;

export function generateQuests(dateKey: string, activities: Activity[], par: number): Quest[] {
  const live = activities.filter((a) => !a.archived);
  // Keystones get their own prominent slot on the Today screen, so a quest
  // telling you to do one would just be the same ask twice.
  const builds = live.filter((a) => a.polarity === 'build' && !a.keystone);
  const burns = live.filter((a) => a.polarity === 'burn');
  if (builds.length === 0) return [];

  const quests: Quest[] = [];
  const rand = seeded(`quests:${dateKey}`);

  // 1. A high-friction activity, because that is the one you'd skip.
  const hard = builds.filter((a) => a.friction >= 4);
  const target = hard.length > 0 ? sampleSeeded(hard, 1, `hard:${dateKey}`)[0] : null;
  if (target) {
    quests.push({
      id: `${dateKey}:hard`,
      kind: 'high_friction',
      label: `Face the hard one: ${target.name}`,
      activityId: target.id,
      target: 1,
      reward: 4,
      done: false,
    });
  }

  // 2. A specific activity with a real amount attached.
  const pickPool = builds.filter((a) => a.id !== target?.id);
  const pick = sampleSeeded(pickPool.length ? pickPool : builds, 1, `pick:${dateKey}`)[0];
  if (pick) {
    const amount = questAmountFor(pick, rand());
    quests.push({
      id: `${dateKey}:pick`,
      kind: 'do_activity',
      // A done/not-done activity has no meaningful amount, so don't invent one.
      label: pick.kind === 'check' ? pick.name : `${pick.name} — ${amount}${unitSuffix(pick)}`,
      activityId: pick.id,
      target: amount,
      reward: 3,
      done: false,
    });
  }

  // 3. Either stay clean of burns, or clear a volume bar. Alternates by seed so
  //    the third slot is never predictable.
  if (burns.length > 0 && rand() < 0.5) {
    quests.push({
      id: `${dateKey}:clean`,
      kind: 'clean_day',
      label: 'Clean sheet — no burns logged',
      target: 0,
      reward: 4,
      done: false,
    });
  } else {
    const bar = Math.max(10, Math.round(par * 0.6));
    quests.push({
      id: `${dateKey}:volume`,
      kind: 'volume',
      label: `Bank ${bar} points`,
      target: bar,
      reward: 3,
      done: false,
    });
  }

  return quests;
}

function questAmountFor(activity: Activity, roll: number): number {
  if (activity.kind === 'check') return 1;
  if (activity.presets && activity.presets.length > 0) {
    const idx = Math.min(activity.presets.length - 1, Math.floor(roll * activity.presets.length));
    return activity.presets[idx];
  }
  if (activity.kind === 'duration') return [20, 30, 45, 60][Math.floor(roll * 4)] ?? 30;
  return Math.max(1, Math.round(roll * 3) + 1);
}

function unitSuffix(activity: Activity): string {
  if (activity.kind === 'check') return '';
  return activity.unit ? ` ${activity.unit}` : '';
}

/** Recompute done-ness from the day's entries. Quests are never manually ticked. */
export function evaluateQuests(
  quests: Quest[],
  entries: LogEntry[],
  activities: Activity[],
  dayScore: number,
): Quest[] {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const burnLogged = entries.some((e) => byId.get(e.activityId)?.polarity === 'burn');

  return quests.map((q) => {
    switch (q.kind) {
      case 'high_friction':
      case 'do_activity': {
        const activity = q.activityId ? byId.get(q.activityId) : undefined;
        if (!activity) return { ...q, done: false };
        const total = entries
          .filter((e) => e.activityId === q.activityId)
          .reduce((sum, e) => sum + standardUnits(activity, e.amount), 0);
        const needed = standardUnits(activity, q.target);
        return { ...q, done: total + 1e-9 >= needed };
      }
      case 'clean_day':
        return { ...q, done: entries.length > 0 && !burnLogged };
      case 'volume':
        return { ...q, done: dayScore >= q.target };
      case 'beat_par':
        return { ...q, done: dayScore >= q.target };
      default:
        return q;
    }
  });
}

export function questReward(quests: Quest[]): number {
  if (quests.length === 0) return 0;
  const earned = quests.filter((q) => q.done).reduce((sum, q) => sum + q.reward, 0);
  const all = quests.every((q) => q.done) ? ALL_QUESTS_BONUS : 0;
  return earned + all;
}
