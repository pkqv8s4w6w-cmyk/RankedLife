import test from 'node:test';
import assert from 'node:assert/strict';
import { computePar, median, MIN_PAR, rpForDay, shortfallAdvice } from '../src/lib/par';
import type { DayRecord } from '../src/lib/types';

function day(dateKey: string, score: number, outcome: DayRecord['outcome'] = 'cleared'): DayRecord {
  return {
    dateKey,
    score,
    par: 40,
    rpDelta: 0,
    rpAfter: 1000,
    outcome,
    modifiers: [],
    questsCompleted: 0,
    closedAt: 0,
  };
}

test('median handles odd and even lengths', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), 0);
});

test('early par ramps up so the first days are winnable', () => {
  const baselinePar = 100;
  const ramped = [0, 1, 2, 3, 4].map((n) =>
    computePar({
      history: Array.from({ length: n }, (_, i) => day(`2026-01-0${i + 1}`, 100)),
      baselinePar,
    }),
  );
  assert.ok(ramped[0] < baselinePar, 'day one asks for less than baseline');
  for (let i = 1; i < ramped.length; i++) {
    assert.ok(ramped[i] >= ramped[i - 1], 'the ramp only goes up');
  }
  assert.ok(ramped[4] <= baselinePar);
});

test('par tracks the trailing median with a small growth nudge', () => {
  const history = Array.from({ length: 14 }, (_, i) => day(`2026-02-${String(i + 1).padStart(2, '0')}`, 50));
  const par = computePar({ history, baselinePar: 40 });
  assert.ok(par > 50 && par <= 53, `expected a touch above the median, got ${par}`);
});

test('par cannot swing wildly day to day', () => {
  const history = Array.from({ length: 14 }, (_, i) => day(`2026-03-${String(i + 1).padStart(2, '0')}`, 200));
  const par = computePar({ history, baselinePar: 40, previousPar: 50 });
  assert.ok(par <= 50 * 1.12 + 1, 'a single huge week cannot spike par');
});

test('rest days are excluded so a deliberate day off does not lower the bar', () => {
  const base = Array.from({ length: 14 }, (_, i) => day(`2026-04-${String(i + 1).padStart(2, '0')}`, 60));
  const withRest = [...base, day('2026-04-15', 0, 'rest'), day('2026-04-16', 0, 'rest')];
  assert.equal(
    computePar({ history: base, baselinePar: 40 }),
    computePar({ history: withRest, baselinePar: 40 }),
  );
});

test('par never drops below a floor', () => {
  const history = Array.from({ length: 14 }, (_, i) => day(`2026-05-${String(i + 1).padStart(2, '0')}`, 0));
  assert.ok(computePar({ history, baselinePar: 40 }) >= MIN_PAR);
});

test('farming easy points raises par, so it buys nothing long term', () => {
  const honest = Array.from({ length: 14 }, (_, i) => day(`2026-06-${String(i + 1).padStart(2, '0')}`, 50));
  const farmed = Array.from({ length: 14 }, (_, i) => day(`2026-06-${String(i + 1).padStart(2, '0')}`, 150));
  assert.ok(
    computePar({ history: farmed, baselinePar: 40 }) >
      computePar({ history: honest, baselinePar: 40 }),
    'inflated history produces a harder target',
  );
});

test('hitting par exactly is a gain, because consistency is the behaviour we want', () => {
  assert.ok(rpForDay(40, 40) > 0);
  assert.equal(rpForDay(40, 40), 10);
});

test('RP scales with how far over or under par you land', () => {
  assert.ok(rpForDay(80, 40) > rpForDay(50, 40));
  assert.ok(rpForDay(0, 40) < rpForDay(30, 40));
});

test('RP gains and losses are both bounded', () => {
  assert.equal(rpForDay(100000, 40), 40, 'gains cap at +40');
  assert.equal(rpForDay(-100000, 40), -36, 'losses cap at -36');
});

test('a zero par cannot divide by zero', () => {
  assert.ok(Number.isFinite(rpForDay(10, 0)));
});

test('shortfall advice always names something concrete to do', () => {
  const advice = shortfallAdvice(20, 40, 'Assignment 50 min');
  assert.match(advice, /20 points short/);
  assert.match(advice, /Assignment 50 min/, 'negative feedback must carry an instruction');
  assert.equal(shortfallAdvice(40, 40), 'You cleared par.');
});
