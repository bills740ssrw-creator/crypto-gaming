import { CurrencyType, GameType } from '@prisma/client';
import {
  CryptoMath,
  generateSessionId,
  generateSeed,
  hashServerSeed,
  computeDigest,
  chunkToFloat,
} from '@crypto-gaming/shared';
import { config } from '../../../../config';
import { redis } from '../../../../services/redis';
import { logger } from '../../../../services/logger';
import { balanceService } from '../../../../services/balance';
import { AppError, NotFoundError, InsufficientBalanceError, ValidationError } from '../../../../middleware/errorHandler';
import { emitToUser } from '../../../../websocket';
import {
  PathRound,
  PathError,
  createPathRound,
  advancePathRound,
  cashoutPathRound,
  cancelPathRound,
  cumulativeMultiplier,
  pathPayout,
  validatePathRows,
} from './engine';
import { finalizeBet, lockStake, resolveGame } from '../settlement';

const rounds = new Map<string, PathRound>();
const memoryNonce = new Map<string, number>();

async function nextNonce(userId: string): Promise<number> {
  let value: number | null = null;
  try {
    const result = await redis.incr(`path:nonce:${userId}`);
    if (typeof result === 'number' && Number.isFinite(result) && result > 0) {
      value = result;
    }
  } catch {
    value = null;
  }
  if (value !== null) return value;
  const next = (memoryNonce.get(userId) ?? 0) + 1;
  memoryNonce.set(userId, next);
  return next;
}

function rowFloatsFor(round: PathRound): number[] {
  return round.rows.map((_, index) => chunkToFloat(round.digest, index));
}

function publicRound(round: PathRound): Record<string, unknown> {
  return {
    kind: 'path',
    roundId: round.id,
    status: round.status,
    stake: round.stake,
    currency: round.currency as CurrencyType,
    rows: round.rows,
    clearedRows: round.clearedRows,
    totalRows: round.rows.length,
    currentMultiplier: cumulativeMultiplier(round.rows, round.clearedRows),
    currentPayout: pathPayout(round.stake, round.rows, round.clearedRows),
    serverSeedHash: round.serverSeedHash,
    clientSeed: round.clientSeed,
    nonce: round.nonce,
    createdAt: round.createdAt,
    expiresAt: round.expiresAt,
    lastRowResult: round.lastRowResult,
    reveal: round.status === 'settled' || round.status === 'cancelled' ? revealFor(round) : null,
  };
}

function revealFor(round: PathRound): Record<string, unknown> {
  return {
    serverSeed: round.serverSeed,
    serverSeedHash: round.serverSeedHash,
    clientSeed: round.clientSeed,
    nonce: round.nonce,
    digest: round.digest,
    clearedRows: round.clearedRows,
    multiplier: cumulativeMultiplier(round.rows, round.clearedRows),
    payout: pathPayout(round.stake, round.rows, round.clearedRows),
    status: round.status,
  };
}

async function validateStake(userId: string, currency: CurrencyType, stake: string): Promise<void> {
  const game = await resolveGame(GameType.PATH_ELIMINATION);
  if (CryptoMath.isLessThan(stake, game.minBet) || CryptoMath.isGreaterThan(stake, game.maxBet)) {
    throw new ValidationError(`Stake must be between ${game.minBet} and ${game.maxBet}`);
  }
  const validation = await balanceService.validateSufficientBalance(userId, currency, stake);
  if (!validation.sufficient) {
    throw new InsufficientBalanceError(currency, stake, validation.currentBalance);
  }
}

function translate(error: unknown): never {
  if (error instanceof PathError) {
    throw new AppError(error.message, 400, error.code);
  }
  throw error;
}

async function sweepExpired(now: number): Promise<void> {
  const staleCutoff = now - 24 * 60 * 60 * 1000;
  for (const [id, round] of rounds) {
    if (round.status === 'committed' && round.clearedRows === 0 && now > round.expiresAt) {
      cancelPathRound(round, now);
      await finalizeBet({
        userId: round.userId,
        currency: round.currency as CurrencyType,
        stake: round.stake,
        payout: '0',
        outcome: 'refund',
        sessionId: round.id,
        gameType: GameType.PATH_ELIMINATION,
        result: { expired: true },
        startedAt: new Date(round.createdAt),
        metadata: { round: id },
      });
      logger.info('Path round expired and refunded', { roundId: id, userId: round.userId });
    } else if (
      (round.status === 'settled' || round.status === 'cancelled') &&
      round.settledAt !== null &&
      round.settledAt < staleCutoff
    ) {
      rounds.delete(id);
    }
  }
}

export async function createRound(
  userId: string,
  stake: string,
  currency: CurrencyType,
  clientSeed?: string
): Promise<Record<string, unknown>> {
  const now = Date.now();
  await sweepExpired(now);
  await validateStake(userId, currency, stake);

  const rows = validatePathRows(config.pathElimination.rows);
  const serverSeed = generateSeed(32);
  const serverSeedHash = await hashServerSeed(serverSeed);
  const seed = clientSeed || generateSeed(16);
  const nonce = await nextNonce(userId);
  const digest = await computeDigest(serverSeed, seed, nonce);
  const id = generateSessionId();

  await lockStake(userId, currency, stake, GameType.PATH_ELIMINATION, id, { round: id });

  const round = createPathRound({
    id,
    userId,
    stake,
    currency,
    rows,
    digest,
    serverSeed,
    serverSeedHash,
    clientSeed: seed,
    nonce,
    now,
    ttlMs: config.pathElimination.cancelWindowMs,
  });
  rounds.set(id, round);
  logger.info('Path round created', { roundId: id, userId, stake, currency });

  return publicRound(round);
}

export async function advance(roundId: string, userId: string): Promise<Record<string, unknown>> {
  const round = rounds.get(roundId);
  if (!round) throw new NotFoundError('Path round');
  if (round.userId !== userId) throw new AppError('Unauthorized', 403, 'UNAUTHORIZED');
  const now = Date.now();

  if (round.status === 'committed' && round.clearedRows === 0 && now > round.expiresAt) {
    cancelPathRound(round, now);
    await finalizeBet({
      userId,
      currency: round.currency as CurrencyType,
      stake: round.stake,
      payout: '0',
      outcome: 'refund',
      sessionId: round.id,
      gameType: GameType.PATH_ELIMINATION,
      result: { expired: true },
      startedAt: new Date(round.createdAt),
      metadata: { round: round.id },
    });
    throw new AppError('Round expired and stake refunded', 400, 'ROUND_EXPIRED');
  }

  try {
    advancePathRound(round, rowFloatsFor(round), now);
  } catch (error) {
    translate(error);
  }

  if (round.status === 'settled') {
    if (round.lastRowResult && round.lastRowResult.success === false) {
      await finalizeBet({
        userId,
        currency: round.currency as CurrencyType,
        stake: round.stake,
        payout: '0',
        outcome: 'loss',
        sessionId: round.id,
        gameType: GameType.PATH_ELIMINATION,
        result: { ...revealFor(round), lastRowResult: round.lastRowResult },
        seed: round.serverSeed,
        clientSeed: round.clientSeed,
        nonce: round.nonce,
        startedAt: new Date(round.createdAt),
        metadata: { round: round.id },
      });
      logger.info('Path round lost', { roundId: round.id, userId, clearedRows: round.clearedRows });
    } else {
      const payout = pathPayout(round.stake, round.rows, round.clearedRows);
      await finalizeBet({
        userId,
        currency: round.currency as CurrencyType,
        stake: round.stake,
        payout,
        outcome: 'win',
        sessionId: round.id,
        gameType: GameType.PATH_ELIMINATION,
        result: revealFor(round),
        seed: round.serverSeed,
        clientSeed: round.clientSeed,
        nonce: round.nonce,
        startedAt: new Date(round.createdAt),
        metadata: { round: round.id },
      });
      logger.info('Path round cleared', { roundId: round.id, userId, clearedRows: round.clearedRows, payout });
    }
  }

  const response = publicRound(round);
  emitToUser(userId, 'path:round', response);
  return response;
}

export async function cashout(roundId: string, userId: string): Promise<Record<string, unknown>> {
  const round = rounds.get(roundId);
  if (!round) throw new NotFoundError('Path round');
  if (round.userId !== userId) throw new AppError('Unauthorized', 403, 'UNAUTHORIZED');
  const now = Date.now();

  try {
    cashoutPathRound(round, now);
  } catch (error) {
    translate(error);
  }

  const payout = pathPayout(round.stake, round.rows, round.clearedRows);
  await finalizeBet({
    userId,
    currency: round.currency as CurrencyType,
    stake: round.stake,
    payout,
    outcome: 'win',
    sessionId: round.id,
    gameType: GameType.PATH_ELIMINATION,
    result: revealFor(round),
    seed: round.serverSeed,
    clientSeed: round.clientSeed,
    nonce: round.nonce,
    startedAt: new Date(round.createdAt),
    metadata: { round: round.id, cashedOut: true },
  });

  logger.info('Path round cashed out', { roundId: round.id, userId, payout });
  const response = publicRound(round);
  emitToUser(userId, 'path:round', response);
  return response;
}

export async function cancel(roundId: string, userId: string): Promise<Record<string, unknown>> {
  const round = rounds.get(roundId);
  if (!round) throw new NotFoundError('Path round');
  if (round.userId !== userId) throw new AppError('Unauthorized', 403, 'UNAUTHORIZED');

  try {
    cancelPathRound(round, Date.now());
  } catch (error) {
    translate(error);
  }

  await finalizeBet({
    userId,
    currency: round.currency as CurrencyType,
    stake: round.stake,
    payout: '0',
    outcome: 'refund',
    sessionId: round.id,
    gameType: GameType.PATH_ELIMINATION,
    result: { cancelled: true },
    startedAt: new Date(round.createdAt),
    metadata: { round: round.id },
  });

  logger.info('Path round cancelled', { roundId: round.id, userId });
  return publicRound(round);
}

export function getRound(roundId: string, userId: string): Record<string, unknown> {
  const round = rounds.get(roundId);
  if (!round || round.userId !== userId) throw new NotFoundError('Path round');
  return publicRound(round);
}
