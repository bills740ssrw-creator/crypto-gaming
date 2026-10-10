import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTttGame,
  joinTttGame,
  playTttMove,
  timeoutTttGame,
  resignTttGame,
  cancelTttGame,
  calculateTttSettlement,
  planTttDisconnectActions,
  pauseTttTurnTimer,
  resumeTttTurnTimer,
  tttTurnRemainingMs,
  isTttTimerPaused,
  TttError,
  MOVE_TIMEOUT_MS,
} from '../src/modules/game/games/tic-tac-toe/engine.ts';

function newGame(now = 1000) {
  const game = createTttGame({ id: 'g1', stake: '10', currency: 'GOLD_COINS', firstPlayerId: 'alice', now });
  joinTttGame(game, 'bob', now);
  return game;
}

test('create and join starts the game with a 3s move timer', () => {
  const game = newGame();
  assert.equal(game.status, 'playing');
  assert.equal(game.turnPlayerId, 'alice');
  assert.equal(game.deadline, 1000 + MOVE_TIMEOUT_MS);
  assert.equal(game.players[0].symbol, 'X');
  assert.equal(game.players[1].symbol, 'O');
});

test('waiting game rejects the creator and starts only after one join', () => {
  const game = createTttGame({ id: 'g2', stake: '10', currency: 'GOLD_COINS', firstPlayerId: 'alice', now: 0 });
  assert.equal(game.status, 'waiting');
  assert.throws(() => joinTttGame(game, 'alice', 10), (error) => error.code === 'ALREADY_JOINED');
  joinTttGame(game, 'bob', 10);
  assert.equal(game.status, 'playing');
  assert.throws(() => joinTttGame(game, 'carol', 20), (error) => error.code === 'ALREADY_STARTED');
});

test('turns alternate and rejects out-of-turn or occupied cells', () => {
  const game = newGame();
  const result = playTttMove(game, 'alice', 4, 1100);
  assert.equal(result.game.board[4], 'X');
  assert.equal(result.game.turnPlayerId, 'bob');
  assert.throws(() => playTttMove(game, 'alice', 0, 1200), (error) => error.code === 'NOT_YOUR_TURN');
  assert.throws(() => playTttMove(game, 'bob', 4, 1200), (error) => error.code === 'CELL_OCCUPIED');
  assert.throws(() => playTttMove(game, 'bob', 99, 1200), (error) => error.code === 'INVALID_CELL');
});

test('three in a row wins the game', () => {
  const game = newGame();
  playTttMove(game, 'alice', 0, 1100);
  playTttMove(game, 'bob', 3, 1200);
  playTttMove(game, 'alice', 1, 1300);
  playTttMove(game, 'bob', 4, 1400);
  playTttMove(game, 'alice', 2, 1500);
  assert.equal(game.status, 'finished');
  assert.equal(game.winnerId, 'alice');
  assert.equal(game.winReason, 'line');
  assert.deepEqual(game.winningLine, [0, 1, 2]);
  assert.equal(game.turnPlayerId, null);
  assert.equal(game.deadline, null);
});

test('expired move timer throws TIMEOUT', () => {
  const game = newGame();
  assert.throws(
    () => playTttMove(game, 'alice', 4, 1000 + MOVE_TIMEOUT_MS + 1),
    (error) => error instanceof TttError && error.code === 'TIMEOUT'
  );
});

test('timeout gives the win to the opponent', () => {
  const game = newGame();
  timeoutTttGame(game, 5000);
  assert.equal(game.status, 'finished');
  assert.equal(game.winnerId, 'bob');
  assert.equal(game.winReason, 'timeout');
});

test('resign gives the win to the opponent', () => {
  const game = newGame();
  assert.throws(() => resignTttGame(game, 'mallory', 1500), (error) => error.code === 'NOT_A_PLAYER');
  resignTttGame(game, 'alice', 2000);
  assert.equal(game.winnerId, 'bob');
  assert.equal(game.winReason, 'resign');
  assert.throws(() => resignTttGame(game, 'bob', 2100), (error) => error.code === 'NOT_PLAYING');
});

test('only the creator can cancel a waiting game', () => {
  const game = createTttGame({ id: 'g3', stake: '10', currency: 'GOLD_COINS', firstPlayerId: 'alice', now: 0 });
  assert.throws(() => cancelTttGame(game, 'bob'), (error) => error.code === 'NOT_OWNER');
  cancelTttGame(game, 'alice');
  assert.equal(game.status, 'finished');
  const started = newGame();
  assert.throws(() => cancelTttGame(started, 'alice'), (error) => error.code === 'ALREADY_STARTED');
});

test('fourth token vanishes the oldest one (FIFO)', () => {
  const game = newGame();
  playTttMove(game, 'alice', 0, 1100);
  playTttMove(game, 'bob', 3, 1200);
  playTttMove(game, 'alice', 1, 1300);
  playTttMove(game, 'bob', 4, 1400);
  playTttMove(game, 'alice', 6, 1500);
  playTttMove(game, 'bob', 7, 1600);
  const result = playTttMove(game, 'alice', 8, 1700);
  assert.equal(result.vanishedCell, 0);
  assert.equal(game.board[0], null);
  assert.equal(game.board[1], 'X');
  assert.equal(game.board[6], 'X');
  assert.equal(game.board[8], 'X');
  assert.deepEqual(game.placements['alice'], [1, 6, 8]);
  assert.equal(game.moveHistory.at(-1)!.vanishedCell, 0);
});

test('board without winners ends in a draw', () => {
  const game = newGame();
  game.board = ['X', 'O', 'X', 'O', 'X', 'O', 'O', 'X', null];
  game.placements = { alice: [], bob: [] };
  game.turnPlayerId = 'bob';
  const { game: finished } = playTttMove(game, 'bob', 8, 2000);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.winReason, 'draw');
  assert.equal(finished.winnerId, null);
});

test('settlement applies a 4% rake on the pot', () => {
  const settlement = calculateTttSettlement('10');
  assert.equal(settlement.pot, '20');
  assert.equal(settlement.winnerPayout, '19.2');
  assert.equal(settlement.rake, '0.8');
  assert.equal(settlement.rakePercent, 4);

  const small = calculateTttSettlement('0.01');
  assert.equal(small.pot, '0.02');
  assert.equal(small.winnerPayout, '0.0192');
  assert.equal(small.rake, '0.0008');
});

test('disconnect plan forfeits a match already in progress', () => {
  const game = newGame();

  assert.deepEqual(planTttDisconnectActions([game], 'alice'), [
    { roomId: 'g1', action: 'forfeit' },
  ]);
  assert.deepEqual(planTttDisconnectActions([game], 'bob'), [
    { roomId: 'g1', action: 'forfeit' },
  ]);
  assert.deepEqual(planTttDisconnectActions([game], 'carol'), []);
});

test('disconnect plan cancels a room still waiting for an opponent', () => {
  const waiting = createTttGame({
    id: 'w1',
    stake: '10',
    currency: 'GOLD_COINS',
    firstPlayerId: 'alice',
    now: 0,
  });
  assert.equal(waiting.status, 'waiting');

  assert.deepEqual(planTttDisconnectActions([waiting], 'alice'), [
    { roomId: 'w1', action: 'cancel' },
  ]);
  assert.deepEqual(planTttDisconnectActions([waiting], 'bob'), []);
});

test('disconnect plan ignores rooms that already settled', () => {
  const game = newGame();
  resignTttGame(game, 'bob', 1200);
  assert.equal(game.status, 'finished');

  assert.deepEqual(planTttDisconnectActions([game], 'alice'), []);
  assert.deepEqual(planTttDisconnectActions([game], 'bob'), []);
});

test('disconnect plan only touches rooms the player sits in', () => {
  const waiting = createTttGame({
    id: 'waiting-1',
    stake: '10',
    currency: 'GOLD_COINS',
    firstPlayerId: 'alice',
    now: 0,
  });
  const playing = createTttGame({
    id: 'playing-1',
    stake: '10',
    currency: 'GOLD_COINS',
    firstPlayerId: 'bob',
    now: 0,
  });
  joinTttGame(playing, 'carol', 10);

  const games = [waiting, playing];

  assert.deepEqual(planTttDisconnectActions(games, 'alice'), [
    { roomId: 'waiting-1', action: 'cancel' },
  ]);
  assert.deepEqual(planTttDisconnectActions(games, 'carol'), [
    { roomId: 'playing-1', action: 'forfeit' },
  ]);
  assert.deepEqual(planTttDisconnectActions(games, 'dave'), []);
});

test('pausing the turn timer banks the remaining time', () => {
  const game = newGame();

  const banked = pauseTttTurnTimer(game, 1000 + 1000);
  assert.equal(banked, MOVE_TIMEOUT_MS - 1000);
  assert.equal(isTttTimerPaused(game), true);
  assert.equal(tttTurnRemainingMs(game, 1000 + 1000), MOVE_TIMEOUT_MS - 1000);
});

test('paused time does not drain while the player is away', () => {
  const game = newGame();
  pauseTttTurnTimer(game, 1000 + 1000);

  // A long pause must not eat into the banked move time.
  assert.equal(tttTurnRemainingMs(game, 1000 + 1000 + 4 * MOVE_TIMEOUT_MS), MOVE_TIMEOUT_MS - 1000);
  assert.equal(isTttTimerPaused(game), true);
});

test('timeout losses never fire while the timer is paused', () => {
  const game = newGame();
  pauseTttTurnTimer(game, 1000 + 500);

  const after = timeoutTttGame(game, 1000 + 60 * 1000);
  assert.equal(after.status, 'playing');
  assert.equal(after.winnerId, null);
  assert.equal(after.winReason, null);
});

test('moves are rejected while the timer is paused', () => {
  const game = newGame();
  pauseTttTurnTimer(game, 1000 + 500);

  assert.throws(
    () => playTttMove(game, 'alice', 4, 1000 + 600),
    (error) => error instanceof TttError && error.code === 'TIMER_PAUSED'
  );
});

test('resuming restarts the clock from the banked time, not the full timeout', () => {
  const game = newGame();
  pauseTttTurnTimer(game, 1000 + 1000);

  const resumeAt = 1000 + 30_000;
  const restored = resumeTttTurnTimer(game, resumeAt);
  assert.equal(restored, MOVE_TIMEOUT_MS - 1000);
  assert.equal(isTttTimerPaused(game), false);
  assert.equal(game.deadline, resumeAt + (MOVE_TIMEOUT_MS - 1000));
  assert.equal(tttTurnRemainingMs(game, resumeAt), MOVE_TIMEOUT_MS - 1000);
});

test('a resumed turn times out once the banked time runs out', () => {
  const game = newGame();
  pauseTttTurnTimer(game, 1000 + 1000);
  const resumeAt = 1000 + 30_000;
  resumeTttTurnTimer(game, resumeAt);

  assert.throws(
    () => playTttMove(game, 'alice', 4, resumeAt + (MOVE_TIMEOUT_MS - 1000) + 1),
    (error) => error instanceof TttError && error.code === 'TIMEOUT'
  );

  timeoutTttGame(game, resumeAt + (MOVE_TIMEOUT_MS - 1000) + 1);
  assert.equal(game.status, 'finished');
  assert.equal(game.winnerId, 'bob');
  assert.equal(game.winReason, 'timeout');
});

test('pausing an already-paused room keeps the first banked amount', () => {
  const game = newGame();
  pauseTttTurnTimer(game, 1000 + 1000);
  const first = game.pausedRemainingMs;

  assert.equal(pauseTttTurnTimer(game, 1000 + 2000), first);
  assert.equal(game.pausedRemainingMs, first);
});

test('a settled game has no turn timer left to pause', () => {
  const game = newGame();
  resignTttGame(game, 'alice', 1200);

  assert.equal(pauseTttTurnTimer(game, 1500), 0);
  assert.equal(isTttTimerPaused(game), false);
  assert.equal(tttTurnRemainingMs(game, 1500), null);
  assert.equal(resumeTttTurnTimer(game, 1500), 0);
});
