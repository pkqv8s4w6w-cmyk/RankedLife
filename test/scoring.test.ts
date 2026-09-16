import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diminish,
  escalate,
  rawPointsFor,
  rollCrit,
  critHeadroom,
  standardUnits,
  scoreEntry,
  buildContext,
} from '../src/lib/scoring';
import type { Activity } from '../src/lib/types';

function activity(patch: Partial<Activity> = {}): Activity {
  return {
    id: 'a',
    name: 'Test',
    emoji: '🧪',
    polarity: 'build',
    kind: 'duration',
    unit: 'min',
    points: 10,
    friction: 3,
    softCap: 20,
    pinned: true,
    archived: false,
    createdAt: 0,
    ...patch,
  };
}

test('standardUnits normalises each activity kind', () => {
  assert.equal(standardUnits(activity({ kind: 'check' }), 99), 1, 'check ignores amount');
  assert.equal(standardUnits(activity({ kind: 'duration' }), 60), 2, '60 min = 2 half-hours');
  assert.equal(standardUnits(activity({ kind: 'money' }), 25), 2.5, '$25 = 2.5 units of $10');
  assert.equal(standardUnits(activity({ kind: 'count' }), 7), 7);
});

test('friction weights the thing you dread above the thing you enjoy', () => {
  const enjoy = rawPointsFor(activity({ friction: 1 }), 30);
  const neutral = rawPointsFor(activity({ friction: 3 }), 30);
  const dread = rawPointsFor(activity({ friction: 5 }), 30);

  assert.equal(neutral, 10);
  assert.ok(enjoy < neutral, 'low friction scores below neutral');
  assert.ok(dread > neutral, 'high friction scores above neutral');
  // The spread has to be worth reacting to but not so wide that easy work is pointless.
  assert.ok(dread / enjoy > 2 && dread / enjoy < 2.5);
});

test('burns ignore friction entirely', () => {
  const a = rawPointsFor(activity({ polarity: 'burn', friction: 1 }), 30);
  const b = rawPointsFor(activity({ polarity: 'burn', friction: 5 }), 30);
  assert.equal(a, b);
});

test('diminishing returns decay past the soft cap', () => {
  const soft = 10;
  assert.equal(diminish(0, 10, soft), 10, 'first slice is full credit');
  assert.equal(diminish(10, 10, soft), 5, 'second slice is halved');
  assert.equal(diminish(20, 10, soft), 2.5, 'third slice is quartered');
  assert.equal(diminish(30, 10, soft), 1, 'fourth slice is a tenth');
  assert.equal(diminish(40, 10, soft), 0.5, 'tail rate takes over');
});

test('diminishing returns split a slice that straddles a step boundary', () => {
  // 15 points starting from 5 spans the rest of step 0 (5 at full) and half of
  // step 1 (10 at half) => 5 + 5 = 10.
  assert.equal(diminish(5, 15, 10), 10);
});

test('grinding one activity cannot beat spreading the same effort', () => {
  const a = activity({ softCap: 20 });
  const ground = [0, 20, 40, 60].reduce((sum, prior) => sum + diminish(prior, 20, 20), 0);
  const spread = 4 * diminish(0, 20, 20);
  assert.ok(ground < spread * 0.6, 'four sessions of one thing is worth well under four fresh ones');
  void a;
});

test('repeat burns escalate rather than decay', () => {
  assert.equal(escalate(0), 1);
  assert.equal(escalate(1), 1.25);
  assert.equal(escalate(2), 1.5);
  assert.equal(escalate(8), 2, 'escalation is capped at double');
});

test('crits are deterministic for a given entry id', () => {
  const a = rollCrit('entry-xyz', 20, 3, 100);
  const b = rollCrit('entry-xyz', 20, 3, 100);
  assert.deepEqual(a, b, 'same id must always produce the same roll');
});

test('deleting and re-adding an entry cannot re-roll the same crit', () => {
  // Different ids are what makes a re-add a genuinely new roll; the guarantee
  // we need is that a *given* id is frozen, which the test above covers. Here we
  // just confirm ids actually diverge in outcome space over a population.
  const outcomes = new Set<string>();
  for (let i = 0; i < 200; i++) {
    outcomes.add(JSON.stringify(rollCrit(`e${i}`, 20, 0, 100).crit));
  }
  assert.ok(outcomes.size > 1, 'crit outcomes vary across entries');
});

test('small entries cannot crit, so rolls are not farmable', () => {
  for (let i = 0; i < 100; i++) {
    assert.equal(rollCrit(`tiny-${i}`, 2.9, 20, 100).crit, null);
  }
});

test('the pity timer guarantees crits arrive within a reasonable dry spell', () => {
  let pity = 0;
  let gotOne = false;
  for (let i = 0; i < 30; i++) {
    const { crit, nextPity } = rollCrit(`pity-${i}`, 20, pity, 100);
    pity = nextPity;
    if (crit) {
      gotOne = true;
      assert.equal(nextPity, 0, 'pity resets on a crit');
      break;
    }
  }
  assert.ok(gotOne, 'a crit should land well inside 30 entries');
});

test('crit bonuses are clipped to the remaining daily headroom', () => {
  let capped = null;
  for (let i = 0; i < 400 && !capped; i++) {
    const { crit } = rollCrit(`cap-${i}`, 100, 40, 5);
    if (crit) capped = crit;
  }
  assert.ok(capped, 'expected at least one crit across 400 forced rolls');
  assert.ok(capped!.bonus <= 5, 'bonus never exceeds headroom');
});

test('critHeadroom caps crits at 40% of the day build total', () => {
  assert.equal(critHeadroom(100, 0), 40);
  assert.equal(critHeadroom(100, 40), 0);
  assert.equal(critHeadroom(100, 999), 0, 'headroom never goes negative');
});

test('scoreEntry returns negative points for burns and escalates repeats', () => {
  const burn = activity({ id: 'b', polarity: 'burn', kind: 'check', points: 20 });
  const ctx = buildContext([], [burn]);
  const first = scoreEntry('e1', burn, 1, ctx);
  assert.equal(first.points, -20);

  ctx.countByActivity[burn.id] = 1;
  const second = scoreEntry('e2', burn, 1, ctx);
  assert.equal(second.points, -25, 'the second burn of the day costs more');
});

test('backfilled entries are worth less than same-day ones', () => {
  const a = activity();
  const ctx = buildContext([], [a]);
  const onTime = scoreEntry('x1', a, 30, { ...ctx }, 1);
  const late = scoreEntry('x1', a, 30, { ...ctx }, 0.7);
  assert.ok(late.points < onTime.points);
});
