import { CurrencyType, GameType } from '@prisma/client';
import { CryptoMath, generateSessionId } from '@crypto-gaming/shared';
import { logger } from '../../../../services/logger';
import { balanceService } from '../../../../services/balance';
import { AppError, NotFoundError, InsufficientBalanceError, ValidationError } from '../../../../middleware/errorHandler';
import { emitToUser } from '../../../../websocket';
import {
  cancelDisconnectGrace,
  registerDisconnectHandler,
  registerDisconnectSuspendHandler,
  registerReconnectHandler,
} from '../../../../websocket/disconnect-grace';
import {
  TttError,
  TttGame,
  createTttGame,
  joinTttGame,
  playTttMove,
  timeoutTttGame,
  resignTttGame,
  cancelTttGame,
  calculateTttSettlement,
  planTttDisconnectActions,
  isTttTimerPaused,
  pauseTttTurnTimer,
  resumeTttTurnTimer,
  tttTurnRemainingMs,
  MOVE_TIMEOUT_MS,
} from './engine';
import { finalizeBet, lockStake, resolveGame } from '../settlement';

const rooms = new Map<string, TttGame>();
const timers = new Map<string, NodeJS.Timeout>();

function nowMs(): number {
  return Date.now();
}

function publicState(game: TttGame): Record<string, unknown> {
  const now = nowMs();
  return {
    kind: 'ttt',
    game: { ...game },
    serverNow: now,
    moveTimeoutMs: MOVE_TIMEOUT_MS,
    // A client renders the countdown as (turnRemainingMs - (Date.now() - serverNow))
    // so its visual timer is always derived from the same clock as the server's.
    turnRemainingMs: tttTurnRemainingMs(game, now),
    timerPaused: isTttTimerPaused(game),
  };
}

function broadcast(game: TttGame, event: string): void {
  for (const player of game.players) {
    emitToUser(player.id, event, publicState(game));
  }
}

async function validateStake(userId: string, currency: CurrencyType, stake: string): Promise<void> {
  const game = await resolveGame(GameType.TIC_TAC_TOE);
  if (CryptoMath.isLessThan(stake, game.minBet) || CryptoMath.isGreaterThan(stake, game.maxBet)) {
    throw new ValidationError(`Stake must be between ${game.minBet} and ${game.maxBet}`);
  }
  const validation = await balanceService.validateSufficientBalance(userId, currency, stake);
  if (!validation.sufficient) {
    throw new InsufficientBalanceError(currency, stake, validation.currentBalance);
  }
}

function clearTimer(gameId: string): void {
  const timer = timers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    timers.delete(gameId);
  }
}

async function settleFinished(game: TttGame): Promise<void> {
  clearTimer(game.id);
  const settlement = calculateTttSettlement(game.stake);
  const result = {
    board: game.board,
    winReason: game.winReason,
    winningLine: game.winningLine,
    winnerId: game.winnerId,
    rake: settlement.rake,
    rakePercent: settlement.rakePercent,
    pot: settlement.pot,
    winnerPayout: settlement.winnerPayout,
    moves: game.moveHistory.length,
  };

  for (const player of game.players) {
    const isWinner = player.id === game.winnerId;
    const isDraw = game.winReason === 'draw';
    await finalizeBet({
      userId: player.id,
      currency: game.currency as CurrencyType,
      stake: game.stake,
      payout: isWinner ? settlement.winnerPayout : '0',
      outcome: isDraw ? 'refund' : isWinner ? 'win' : 'loss',
      sessionId: game.id,
      gameType: GameType.TIC_TAC_TOE,
      result,
      startedAt: new Date(game.startedAt || game.createdAt),
      metadata: { room: game.id, rake: settlement.rake, winReason: game.winReason },
    });
  }

  logger.info('Tic-tac-toe settled', {
    gameId: game.id,
    winnerId: game.winnerId,
    reason: game.winReason,
    rake: settlement.rake,
  });
  broadcast(game, 'ttt:final');
}

function scheduleTurnTimer(game: TttGame): void {
  clearTimer(game.id);
  if (game.status !== 'playing' || game.deadline === null || game.pausedRemainingMs !== null) return;
  const delay = Math.max(0, game.deadline - nowMs());
  const timer = setTimeout(() => {
    void (async () => {
      if (game.status !== 'playing') return;
      // The grace owns the room now: no timeout loss may settle it.
      if (isTttTimerPaused(game)) return;
      if (game.deadline !== null && nowMs() < game.deadline) {
        scheduleTurnTimer(game);
        return;
      }
      timeoutTttGame(game, nowMs());
      broadcast(game, 'ttt:update');
      await settleFinished(game);
    })();
  }, delay);
  timers.set(game.id, timer);
}

function sweepFinishedRooms(now: number): void {
  const cutoff = now - 10 * 60 * 1000;
  for (const [id, room] of rooms) {
    if (room.status === 'finished' && room.endedAt !== null && room.endedAt < cutoff) {
      rooms.delete(id);
      clearTimer(id);
    }
  }
}

export async function createRoom(userId: string, stake: string, currency: CurrencyType): Promise<Record<string, unknown>> {
  sweepFinishedRooms(Date.now());
  await validateStake(userId, currency, stake);
  const id = generateSessionId();
  const game = createTttGame({ id, stake, currency, firstPlayerId: userId, now: nowMs() });
  await lockStake(userId, currency, stake, GameType.TIC_TAC_TOE, id, { room: id });
  rooms.set(id, game);
  logger.info('Tic-tac-toe room created', { gameId: id, userId, stake, currency });
  return publicState(game) as Record<string, unknown>;
}

export async function joinRoom(gameId: string, userId: string): Promise<Record<string, unknown>> {
  const game = rooms.get(gameId);
  if (!game) throw new NotFoundError('Game room');
  if (game.players.some((player) => player.id === userId)) {
    throw new AppError('Already in this room', 400, 'ALREADY_JOINED');
  }
  const stake = game.stake;
  const currency = game.currency as CurrencyType;
  await validateStake(userId, currency, stake);

  try {
    joinTttGame(game, userId, nowMs());
  } catch (error) {
    if (error instanceof TttError) throw new AppError(error.message, 400, error.code);
    throw error;
  }

  try {
    await lockStake(userId, currency, stake, GameType.TIC_TAC_TOE, gameId, { room: gameId });
  } catch (error) {
    game.players.pop();
    delete game.placements[userId];
    game.status = 'waiting';
    game.turnPlayerId = null;
    game.deadline = null;
    game.startedAt = null;
    throw error;
  }

  scheduleTurnTimer(game);
  broadcast(game, 'ttt:joined');
  logger.info('Tic-tac-toe room joined', { gameId, userId });
  return publicState(game) as Record<string, unknown>;
}

function translate(error: unknown): never {
  if (error instanceof TttError) {
    throw new AppError(error.message, 400, error.code);
  }
  throw error;
}

export async function move(gameId: string, userId: string, cell: number): Promise<Record<string, unknown>> {
  const game = rooms.get(gameId);
  if (!game) throw new NotFoundError('Game room');

  // An HTTP move is proof of life: if the seat is still parked behind a
  // disconnect grace, resume its clock (and close the grace) before judging
  // the move, so a reconnecting player is never rejected for being paused.
  if (isTttTimerPaused(game)) {
    resumeTttTurnTimer(game, nowMs());
    scheduleTurnTimer(game);
    cancelDisconnectGrace(userId);
  }

  try {
    playTttMove(game, userId, cell, nowMs());
  } catch (error) {
    if (error instanceof TttError && error.code === 'TIMEOUT') {
      timeoutTttGame(game, nowMs());
      broadcast(game, 'ttt:update');
      await settleFinished(game);
      throw new AppError('Move timer expired', 400, 'TIMEOUT');
    }
    translate(error);
  }

  if (game.status === 'finished') {
    broadcast(game, 'ttt:update');
    await settleFinished(game);
  } else {
    scheduleTurnTimer(game);
    broadcast(game, 'ttt:move');
  }
  return publicState(game) as Record<string, unknown>;
}

export async function resign(gameId: string, userId: string): Promise<Record<string, unknown>> {
  const game = rooms.get(gameId);
  if (!game) throw new NotFoundError('Game room');
  try {
    resignTttGame(game, userId, nowMs());
  } catch (error) {
    translate(error);
  }
  broadcast(game, 'ttt:update');
  await settleFinished(game);
  return publicState(game) as Record<string, unknown>;
}

export async function cancel(gameId: string, userId: string): Promise<Record<string, unknown>> {
  const game = rooms.get(gameId);
  if (!game) throw new NotFoundError('Game room');
  try {
    cancelTttGame(game, userId);
  } catch (error) {
    translate(error);
  }
  rooms.delete(gameId);
  clearTimer(gameId);
  await finalizeBet({
    userId,
    currency: game.currency as CurrencyType,
    stake: game.stake,
    payout: '0',
    outcome: 'refund',
    sessionId: game.id,
    gameType: GameType.TIC_TAC_TOE,
    result: { cancelled: true },
    startedAt: new Date(game.createdAt),
    metadata: { room: game.id },
  });
  logger.info('Tic-tac-toe room cancelled', { gameId, userId });
  return { kind: 'ttt', cancelled: true };
}

export function getRoom(gameId: string): Record<string, unknown> | null {
  const game = rooms.get(gameId);
  return game ? (publicState(game) as Record<string, unknown>) : null;
}

export function listOpenRooms(currency?: CurrencyType): Array<Record<string, unknown>> {
  const open: Array<Record<string, unknown>> = [];
  for (const game of rooms.values()) {
    if (game.status === 'waiting' && (!currency || game.currency === currency)) {
      open.push(publicState(game) as Record<string, unknown>);
    }
  }
  return open;
}

export function planDisconnectActions(userId: string): Array<{ roomId: string; action: 'forfeit' | 'cancel' }> {
  return planTttDisconnectActions(rooms.values(), userId);
}

/**
 * Freezes the turn clock of every in-progress room this player sits in and
 * tells both clients the timer is paused. Runs the instant their last socket
 * drops, before the grace window starts, so the opponent can never win on the
 * clock while the seat is only temporarily gone.
 */
export function pauseRoomTimersFor(userId: string): string[] {
  const paused: string[] = [];
  for (const game of rooms.values()) {
    if (game.status !== 'playing') continue;
    if (!game.players.some((player) => player.id === userId)) continue;

    clearTimer(game.id);
    pauseTttTurnTimer(game, nowMs());
    paused.push(game.id);
    broadcast(game, 'ttt:update');
  }
  if (paused.length > 0) {
    logger.debug('Paused turn timer for disconnected player', { userId, rooms: paused });
  }
  return paused;
}

/**
 * Restores the banked turn time and restarts the clock when the player comes
 * back inside the grace window.
 */
export function resumeRoomTimersFor(userId: string): string[] {
  const resumed: string[] = [];
  for (const game of rooms.values()) {
    if (game.status !== 'playing') continue;
    if (!game.players.some((player) => player.id === userId)) continue;
    if (game.pausedRemainingMs === null) continue;

    resumeTttTurnTimer(game, nowMs());
    scheduleTurnTimer(game);
    resumed.push(game.id);
    broadcast(game, 'ttt:update');
  }
  if (resumed.length > 0) {
    logger.debug('Resumed turn timer for reconnected player', { userId, rooms: resumed });
  }
  return resumed;
}

export async function handleDisconnectTimeout(userId: string): Promise<void> {
  const plan = planDisconnectActions(userId);
  if (plan.length === 0) return;

  logger.info('Disconnect grace expired, settling tic-tac-toe rooms', { userId, plan });

  for (const { roomId, action } of plan) {
    try {
      if (action === 'forfeit') {
        await resign(roomId, userId);
      } else {
        await cancel(roomId, userId);
      }
    } catch (error) {
      logger.error('Failed to settle room after disconnect', {
        userId,
        roomId,
        action,
        error: (error as Error).message,
      });
    }
  }
}

registerDisconnectSuspendHandler((userId) => {
  pauseRoomTimersFor(userId);
});

registerReconnectHandler((userId) => {
  resumeRoomTimersFor(userId);
});

registerDisconnectHandler(handleDisconnectTimeout);
