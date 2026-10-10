import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePathRows,
  rowSucceeded,
  cumulativeMultiplier,
  pathPayout,
  createPathRound,
  advancePathRound,
  cashoutPathRound,
  cancelPathRound,
  DEFAULT_PATH_ROWS,
  PathError,
} from '../src/modules/game/games/path-elimination/engine.ts';
import type { PathRound } from '../src/modules/game/games/path-elimination/engine.ts';

const DUMMY_DIGEST = 'a'.repeat(64);

function newRound(now = 1000): PathRound {
  return createPathRound({
    id: 'p1',
    userId: 'alice',
    stake: '10',
    currency: 'GOLD_COINS',
    rows: DEFAULT_PATH_ROWS,
    digest: DUMMY_DIGEST,
    serverSeed: 'b'.repeat(64),
    serverSeedHash: 'c'.repeat(64),
    clientSeed: 'alice-seed',
    nonce: 1,
    now,
    ttlMs: 600000,
  });
}

function advanceTimes(round: PathRound, floats: number[], times: number, start = 2000): void {
  for (let i = 0; i < times; i++) {
    if (round.status !== 'committed' && round.status !== 'active') break;
    advancePathRound(round, floats, start + i);
  }
}

test('default rows validate and bad configs are rejected', () => {
  assert.equal(validatePathRows(DEFAULT_PATH_ROWS).length, 5);
  assert.throws(() => validatePathRows(DEFAULT_PATH_ROWS.slice(0, 4)), PathError);
  assert.throws(
    () => validatePathRows([{ winProbability: 1, multiplier: 2 }, ...DEFAULT_PATH_ROWS.slice(1)]),
    PathError
  );
  assert.throws(
    () => validatePathRows([{ winProbability: 0.5, multiplier: 0 }, ...DEFAULT_PATH_ROWS.slice(1)]),
    PathError
  );
});

test('row success is float < winProbability', () => {
  assert.ok(rowSucceeded({ winProbability: 0.95, multiplier: 1 }, 0));
  assert.ok(rowSucceeded({ winProbability: 0.95, multiplier: 1 }, 0.9499999));
  assert.ok(!rowSucceeded({ winProbability: 0.95, multiplier: 1 }, 0.95));
  assert.ok(!rowSucceeded({ winProbability: 0.4, multiplier: 1 }, 0.96));
  assert.throws(() => rowSucceeded({ winProbability: 0.5, multiplier: 1 }, 1), PathError);
  assert.throws(() => rowSucceeded({ winProbability: 0.5, multiplier: 1 }, -0.1), PathError);
});

test('cumulative multiplier and payout', () => {
  assert.equal(cumulativeMultiplier(DEFAULT_PATH_ROWS, 0), '1');
  assert.equal(cumulativeMultiplier(DEFAULT_PATH_ROWS, 1), '1.0105');
  assert.equal(cumulativeMultiplier(DEFAULT_PATH_ROWS, 2), '1.1412587');
  assert.equal(pathPayout('10', DEFAULT_PATH_ROWS, 0), '10');
  assert.equal(pathPayout('10', DEFAULT_PATH_ROWS, 2), '11.412587');
  assert.equal(pathPayout('10', DEFAULT_PATH_ROWS, 5), '65.5660982');
});

test('advance walks one row per call until all five clear', () => {
  const round = newRound();
  const floats = [0.5, 0.5, 0.5, 0.5, 0.3];
  advancePathRound(round, floats, 2000);
  assert.equal(round.status, 'active');
  assert.equal(round.clearedRows, 1);
  advanceTimes(round, floats, 4, 2001);
  assert.equal(round.status, 'settled');
  assert.equal(round.clearedRows, 5);
  assert.equal(round.lastRowResult!.success, true);
  assert.equal(pathPayout(round.stake, round.rows, round.clearedRows), '65.5660982');
});

test('advance stops at the first failed row', () => {
  const round = newRound();
  advancePathRound(round, [0.96, 0, 0, 0, 0], 2000);
  assert.equal(round.status, 'settled');
  assert.equal(round.clearedRows, 0);
  assert.equal(round.lastRowResult!.success, false);
  assert.equal(round.lastRowResult!.row, 0);
});

test('partial progress settles as a loss on a later row', () => {
  const round = newRound();
  const floats = [0.5, 0.5, 0.96, 0, 0];
  advanceTimes(round, floats, 3);
  assert.equal(round.status, 'settled');
  assert.equal(round.clearedRows, 2);
  assert.equal(round.lastRowResult!.row, 2);
  assert.equal(round.lastRowResult!.success, false);
});

test('cashout requires at least one cleared row then settles', () => {
  const fresh = newRound();
  assert.throws(() => cashoutPathRound(fresh, 2000), (error) => error.code === 'NOTHING_CLEARED');

  const round = newRound();
  advancePathRound(round, [0.5, 0.5, 0.5, 0.5, 0.5], 2000);
  assert.equal(round.status, 'active');
  cashoutPathRound(round, 2100);
  assert.equal(round.status, 'settled');
  assert.equal(pathPayout(round.stake, round.rows, round.clearedRows), '10.105');
});

test('cashout on an already settled round is rejected', () => {
  const round = newRound();
  advanceTimes(round, [0.96, 0, 0, 0, 0], 1);
  assert.equal(round.status, 'settled');
  assert.throws(() => cashoutPathRound(round, 3000), (error) => error.code === 'ROUND_NOT_ACTIVE');
});

test('cancel only works before any advance', () => {
  const fresh = newRound();
  cancelPathRound(fresh, 2000);
  assert.equal(fresh.status, 'cancelled');

  const advanced = newRound();
  advancePathRound(advanced, [0.5, 0.5, 0.5, 0.5, 0.5], 2000);
  assert.throws(() => cancelPathRound(advanced, 3000), (error) => error.code === 'ALREADY_STARTED');

  const lost = newRound();
  advancePathRound(lost, [0.96, 0, 0, 0, 0], 2000);
  assert.throws(() => cancelPathRound(lost, 3000), (error) => error.code === 'ROUND_NOT_CANCELLABLE');
});

test('expired window is stored for the service to enforce', () => {
  const round = newRound(1000);
  assert.equal(round.expiresAt, 1000 + 600000);
  assert.equal(round.status, 'committed');
  assert.equal(round.clearedRows, 0);
});
