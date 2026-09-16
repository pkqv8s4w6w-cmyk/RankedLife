import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRp,
  labelForRp,
  rankFor,
  softReset,
  TIERS,
  tierIndexForRp,
  wouldDemote,
  STARTING_RP,
} from '../src/lib/rank';

test('every tier boundary maps to the tier that owns it', () => {
  for (const tier of TIERS) {
    assert.equal(rankFor(tier.floor).tier.name, tier.name, `${tier.name} floor`);
    assert.equal(rankFor(tier.floor - 1).tier.name !== tier.name, tier.floor > 0);
  }
});

test('divisions count down as RP goes up', () => {
  const bronze = TIERS.find((t) => t.name === 'Bronze')!;
  const span = (TIERS[2].floor - bronze.floor) / 3;
  assert.equal(rankFor(bronze.floor).division, 3, 'bottom of a tier is division III');
  assert.equal(rankFor(bronze.floor + span * 2.5).division, 1, 'top of a tier is division I');
});

test('rank labels are stable and readable', () => {
  assert.equal(labelForRp(0), 'Iron III');
  assert.equal(labelForRp(1800), 'Gold III');
  assert.equal(labelForRp(6400), 'Apex', 'the top tier has no divisions');
});

test('progress through a division stays inside 0..1', () => {
  for (let rp = 0; rp <= 9999; rp += 37) {
    const p = rankFor(rp).progress;
    assert.ok(p >= 0 && p <= 1, `progress out of range at ${rp}`);
  }
});

test('you start on the ladder, not at zero', () => {
  // Endowed progress: a head start measurably raises completion rates, and
  // starting at rock bottom makes the first week feel unwinnable.
  assert.ok(STARTING_RP > 0);
  assert.equal(rankFor(STARTING_RP).tier.name, 'Bronze');
});

test('demotion protection clips the first fall to the tier floor', () => {
  const goldFloor = TIERS.find((t) => t.name === 'Gold')!.floor;
  const rp = goldFloor + 10;
  assert.ok(wouldDemote(rp, -50));

  const first = applyRp(rp, -50, false);
  assert.equal(first.rp, goldFloor, 'clipped to the floor rather than demoted');
  assert.equal(first.demoted, false);
  assert.equal(first.protectionUsed, true);

  const second = applyRp(goldFloor, -50, true);
  assert.ok(second.rp < goldFloor, 'a second fall while protected actually demotes');
  assert.equal(second.demoted, true);
});

test('RP is clamped to the ladder at both ends', () => {
  assert.equal(applyRp(10, -500, true).rp, 0);
  assert.equal(applyRp(9990, 500, false).rp, 9999);
});

test('gains never trigger demotion protection', () => {
  const result = applyRp(1000, 40, false);
  assert.equal(result.protectionUsed, false);
  assert.equal(result.rp, 1040);
});

test('the season soft reset compresses toward the middle without wiping', () => {
  const high = softReset(6000);
  const low = softReset(200);
  assert.ok(high < 6000 && high > 3000, 'a high rank falls but keeps most of the climb');
  assert.ok(low > 200, 'a low rank is pulled up, so a new season is never hopeless');
  assert.ok(softReset(6000) > softReset(3000), 'ordering is preserved');
});

test('tierIndexForRp is monotonic', () => {
  let previous = -1;
  for (let rp = 0; rp <= 9999; rp += 50) {
    const index = tierIndexForRp(rp);
    assert.ok(index >= previous, `tier index went backwards at ${rp}`);
    previous = index;
  }
});
