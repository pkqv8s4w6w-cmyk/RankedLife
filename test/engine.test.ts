import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addEntry,
  catchUp,
  closeDay,
  entriesForDay,
  freshProfile,
  GHOST_CATCHUP_FLOOR,
  PLACEMENT_DAYS,
  removeEntry,
  STREAK_DAMAGE_PER_MISS,
} from '../src/lib/engine';
import { addDays, dayKeyFor, daysBetween, todayKey, weekStartKey } from '../src/lib/dates';
import { freshState } from '../src/lib/defaults';
import type { AppState, DayRecord } from '../src/lib/types';

function stateWithHistory(): AppState {
  const base = freshState();
  return {
    ...base,
    onboarded: true,
    profile: { ...base.profile, placementsLeft: 0 },
  };
}

function seedClosedDays(state: AppState, count: number, score: number): AppState {
  const days: Record<string, DayRecord> = {};
  for (let i = count; i > 0; i--) {
    const key = addDays(todayKey(state.settings.dayRolloverHour), -i);
    days[key] = {
      dateKey: key,
      score,
      par: score,
      rpDelta: 10,
      rpAfter: state.profile.rp,
      outcome: 'cleared',
      modifiers: [],
      questsCompleted: 0,
      closedAt: 0,
    };
  }
  return { ...state, days, profile: { ...state.profile, lastClosedKey: addDays(todayKey(state.settings.dayRolloverHour), -1) } };
}

test('logging an entry scores it and stores the points frozen', () => {
  const state = stateWithHistory();
  const today = todayKey(state.settings.dayRolloverHour);
  const { state: next, entry } = addEntry(state, {
    activityId: 'gym',
    amount: 60,
    dateKey: today,
    source: 'tap',
  });

  assert.ok(entry, 'entry was created');
  assert.ok(entry!.points > 0);
  assert.equal(entriesForDay(next, today).length, 1);
});

test('an unknown activity id is rejected rather than scored as zero', () => {
  const state = stateWithHistory();
  const { entry } = addEntry(state, {
    activityId: 'nope',
    amount: 1,
    dateKey: todayKey(state.settings.dayRolloverHour),
    source: 'tap',
  });
  assert.equal(entry, null);
});

test('you cannot log into a day that has already been settled', () => {
  let state = stateWithHistory();
  const today = todayKey(state.settings.dayRolloverHour);
  state = seedClosedDays(state, 3, 40);
  const settledKey = Object.keys(state.days)[0];

  const { entry } = addEntry(state, {
    activityId: 'gym',
    amount: 30,
    dateKey: settledKey,
    source: 'manual',
  });
  assert.equal(entry, null, 'settled days are immutable');
  void today;
});

test('you cannot log further into the past than the backfill window', () => {
  const state = stateWithHistory();
  const old = addDays(todayKey(state.settings.dayRolloverHour), -5);
  assert.equal(addEntry(state, { activityId: 'gym', amount: 30, dateKey: old, source: 'manual' }).entry, null);
});

test('you cannot log into the future', () => {
  const state = stateWithHistory();
  const future = addDays(todayKey(state.settings.dayRolloverHour), 1);
  assert.equal(
    addEntry(state, { activityId: 'gym', amount: 30, dateKey: future, source: 'manual' }).entry,
    null,
  );
});

test('backfilling yesterday works but pays less', () => {
  const state = stateWithHistory();
  const today = todayKey(state.settings.dayRolloverHour);
  const yesterday = addDays(today, -1);

  const onTime = addEntry(state, { activityId: 'gym', amount: 60, dateKey: today, source: 'tap' }).entry!;
  const late = addEntry(state, { activityId: 'gym', amount: 60, dateKey: yesterday, source: 'manual' }).entry!;

  assert.ok(late.points < onTime.points);
  assert.equal(late.backfillFactor, 0.7);
});

test('removing an entry works until the day settles', () => {
  const state = stateWithHistory();
  const today = todayKey(state.settings.dayRolloverHour);
  const { state: withEntry, entry } = addEntry(state, {
    activityId: 'gym',
    amount: 30,
    dateKey: today,
    source: 'tap',
  });
  const removed = removeEntry(withEntry, entry!.id);
  assert.equal(entriesForDay(removed, today).length, 0);
});

test('closing a day over par gains RP and extends the streak', () => {
  let state = seedClosedDays(stateWithHistory(), 6, 40);
  const key = todayKey(state.settings.dayRolloverHour);
  state = addEntry(state, { activityId: 'gym', amount: 90, dateKey: key, source: 'tap' }).state;
  state = addEntry(state, { activityId: 'assignment', amount: 60, dateKey: key, source: 'tap' }).state;

  const before = state.profile.streak;
  const { record, profile } = closeDay(state, key);

  assert.ok(record.rpDelta > 0, `expected a gain, got ${record.rpDelta}`);
  assert.equal(profile.streak, before + 1);
  assert.equal(record.outcome, 'cleared');
});

test('a day with nothing logged costs RP and damages the streak without zeroing it', () => {
  let state = seedClosedDays(stateWithHistory(), 6, 40);
  state = {
    ...state,
    settings: { ...state.settings, autoShield: false },
    profile: { ...state.profile, streak: 20, shields: 0 },
  };

  const { record, profile } = closeDay(state, todayKey(state.settings.dayRolloverHour));

  assert.equal(record.outcome, 'missed');
  assert.ok(record.rpDelta < 0);
  assert.equal(profile.streak, 20 - STREAK_DAMAGE_PER_MISS, 'damaged, not reset');
  assert.ok(profile.streak > 0, 'one missed day never wipes a long streak');
});

test('placements cannot lose RP', () => {
  let state = seedClosedDays(stateWithHistory(), 6, 80);
  state = { ...state, profile: { ...state.profile, placementsLeft: PLACEMENT_DAYS } };

  const { record, profile } = closeDay(state, todayKey(state.settings.dayRolloverHour));

  assert.ok(record.rpDelta >= 0, 'a placement day can never go backwards');
  assert.equal(record.outcome, 'placement');
  assert.equal(profile.placementsLeft, PLACEMENT_DAYS - 1);
});

test('a shield absorbs a loss on a day you showed up for', () => {
  let state = seedClosedDays(stateWithHistory(), 6, 100);
  const key = todayKey(state.settings.dayRolloverHour);
  state = { ...state, profile: { ...state.profile, shields: 2 } };
  // Enough to count as showing up (past 35% of par), nowhere near clearing it.
  state = addEntry(state, { activityId: 'gym', amount: 90, dateKey: key, source: 'tap' }).state;
  state = addEntry(state, { activityId: 'assignment', amount: 30, dateKey: key, source: 'tap' }).state;

  const { record, profile } = closeDay(state, key);

  assert.equal(record.outcome, 'shielded');
  assert.equal(record.rpDelta, 0, 'the shield zeroes the loss but grants no gain');
  assert.equal(profile.shields, 1, 'and it is spent');
});

test('a shield is not wasted on a day you barely touched', () => {
  let state = seedClosedDays(stateWithHistory(), 6, 100);
  const key = todayKey(state.settings.dayRolloverHour);
  state = { ...state, profile: { ...state.profile, shields: 2 } };
  // A single trivial entry is well under the 35%-of-par bar.
  state = addEntry(state, { activityId: 'read', amount: 5, dateKey: key, source: 'tap' }).state;

  const { record, profile } = closeDay(state, key);

  assert.notEqual(record.outcome, 'shielded');
  assert.equal(profile.shields, 2, 'shields are kept for days that deserve them');
});

test('catchUp settles every open day and caps the total damage', () => {
  const base = stateWithHistory();
  const today = todayKey(base.settings.dayRolloverHour);
  const state: AppState = {
    ...base,
    settings: { ...base.settings, autoShield: false },
    profile: {
      ...base.profile,
      rp: 3000,
      shields: 0,
      lastClosedKey: addDays(today, -15),
    },
  };

  const before = state.profile.rp;
  const result = catchUp(state);

  assert.equal(result.closed.length, 14, 'every open day before today is settled');
  assert.ok(
    result.state.profile.rp >= before + GHOST_CATCHUP_FLOOR,
    'coming back after a bad stretch stays recoverable',
  );
  assert.ok(result.state.profile.rp < before, 'but it still costs something');
});

test('catchUp is idempotent', () => {
  const base = stateWithHistory();
  const today = todayKey(base.settings.dayRolloverHour);
  const state: AppState = {
    ...base,
    profile: { ...base.profile, lastClosedKey: addDays(today, -4) },
  };

  const once = catchUp(state);
  const twice = catchUp(once.state);

  assert.equal(twice.closed.length, 0, 'a second pass settles nothing new');
  assert.equal(twice.state.profile.rp, once.state.profile.rp);
});

test('catchUp on a brand new profile does nothing', () => {
  const result = catchUp(freshState());
  assert.equal(result.closed.length, 0);
});

test('a fresh profile starts with reserves and placements', () => {
  const profile = freshProfile('2026-01-01');
  assert.ok(profile.shields > 0, 'you get reserves before you need them');
  assert.equal(profile.placementsLeft, PLACEMENT_DAYS);
  assert.equal(profile.streak, 0);
});

// ---- dates -----------------------------------------------------------------

test('the rollover hour keeps a 1am entry on the night before', () => {
  const lateNight = new Date(2026, 4, 10, 1, 30);
  assert.equal(dayKeyFor(lateNight, 4), '2026-05-09');
  assert.equal(dayKeyFor(lateNight, 0), '2026-05-10');
});

test('daysBetween survives a daylight-saving boundary', () => {
  assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2);
  assert.equal(daysBetween('2026-11-01', '2026-11-02'), 1);
  assert.equal(daysBetween('2026-03-09', '2026-03-07'), -2);
});

test('addDays rolls months and years correctly', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29', 'leap year');
});

test('weeks start on Monday', () => {
  assert.equal(weekStartKey('2026-05-10'), '2026-05-04', 'a Sunday belongs to the week before');
  assert.equal(weekStartKey('2026-05-04'), '2026-05-04');
});
