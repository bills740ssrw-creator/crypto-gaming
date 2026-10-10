import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  houseMoveFromFloat,
  rpsOutcome,
  streakMultiplier,
  totalWinMultiplier,
  nextStreak,
  rpsPayout,
  isRpsMove,
  RpsError,
} from '../src/modules/game/games/rock-paper-scissors/engine.ts';

test('house move maps float thirds to rock paper scissors', () => {
  assert.equal(houseMoveFromFloat(0), 'rock');
  assert.equal(houseMoveFromFloat(0.3333333), 'rock');
  assert.equal(houseMoveFromFloat(0.34), 'paper');
  assert.equal(houseMoveFromFloat(0.66), 'paper');
  assert.equal(houseMoveFromFloat(0.67), 'scissors');
  assert.equal(houseMoveFromFloat(0.9999999), 'scissors');
  assert.throws(() => houseMoveFromFloat(1), RpsError);
  assert.throws(() => houseMoveFromFloat(-0.1), RpsError);
  assert.throws(() => houseMoveFromFloat(Number.NaN), RpsError);
});

test('outcome matrix is correct', () => {
  assert.equal(rpsOutcome('rock', 'scissors'), 'win');
  assert.equal(rpsOutcome('paper', 'rock'), 'win');
  assert.equal(rpsOutcome('scissors', 'paper'), 'win');
  assert.equal(rpsOutcome('rock', 'paper'), 'loss');
  assert.equal(rpsOutcome('paper', 'scissors'), 'loss');
  assert.equal(rpsOutcome('scissors', 'rock'), 'loss');
  assert.equal(rpsOutcome('rock', 'rock'), 'push');
  assert.equal(rpsOutcome('paper', 'paper'), 'push');
  assert.equal(rpsOutcome('scissors', 'scissors'), 'push');
});

test('streak multiplier grows by step and caps at 1.5x', () => {
  assert.equal(streakMultiplier(0), 1);
  assert.equal(streakMultiplier(1), 1.1);
  assert.equal(streakMultiplier(4), 1.4);
  assert.equal(streakMultiplier(5), 1.5);
  assert.equal(streakMultiplier(100), 1.5);
  assert.equal(streakMultiplier(-3), 1);
});

test('total win multiplier composes base and streak bonus', () => {
  assert.equal(totalWinMultiplier(0), 1.95);
  assert.equal(totalWinMultiplier(1), 2.145);
  assert.equal(totalWinMultiplier(4), 2.73);
  assert.equal(totalWinMultiplier(5), 2.925);
});

test('streak tracking: win grows, push holds, loss resets', () => {
  assert.equal(nextStreak(3, 'win'), 4);
  assert.equal(nextStreak(3, 'push'), 3);
  assert.equal(nextStreak(3, 'loss'), 0);
});

test('payout math for win push and loss', () => {
  const win = rpsPayout('10', 'win', 0);
  assert.equal(win.payout, '19.5');
  assert.equal(win.net, '9.5');
  assert.equal(win.multiplier, 1.95);
  assert.equal(win.streakAfter, 1);

  const hot = rpsPayout('10', 'win', 4);
  assert.equal(hot.payout, '27.3');
  assert.equal(hot.net, '17.3');
  assert.equal(hot.streakAfter, 5);

  const capped = rpsPayout('10', 'win', 5);
  assert.equal(capped.payout, '29.25');

  const push = rpsPayout('10', 'push', 3);
  assert.equal(push.payout, '10');
  assert.equal(push.net, '0');
  assert.equal(push.streakAfter, 3);

  const loss = rpsPayout('10', 'loss', 3);
  assert.equal(loss.payout, '0');
  assert.equal(loss.net, '-10');
  assert.equal(loss.streakAfter, 0);
});

test('payout math keeps full precision on tiny stakes', () => {
  assert.equal(rpsPayout('0.01', 'win', 0).payout, '0.0195');
  assert.equal(rpsPayout('0.01', 'win', 0).net, '0.0095');
});

test('isRpsMove guards unknown choices', () => {
  assert.ok(isRpsMove('rock'));
  assert.ok(isRpsMove('paper'));
  assert.ok(isRpsMove('scissors'));
  assert.ok(!isRpsMove('lizard'));
  assert.ok(!isRpsMove(''));
});
