import { CurrencyType, GameType } from '@prisma/client';
import {
  CryptoMath,
  generateSessionId,
  generateSeed,
  hashServerSeed,
  computeDigest,
  digestToFloat,
} from '@crypto-gaming/shared';
import { config } from '../../../../config';
import { redis } from '../../../../services/redis';
import { logger } from '../../../../services/logger';
import { balanceService } from '../../../../services/balance';
import { AppError, NotFoundError, InsufficientBalanceError, ValidationError } from '../../../../middleware/errorHandler';
import { emitToUser } from '../../../../websocket';
import {
  RpsMove,
  RpsConfig,
  RpsOutcome,
  isRpsMove,
  houseMoveFromFloat,
  rpsOutcome,
  rpsPayout,
} from './engine';
import { finalizeBet, lockStake, resolveGame } from '../settlement';

export interface RpsRound {
  id: string;
  userId: string;
  stake: string;
  currency: CurrencyType;
  clientSeed: string;
  nonce: number;
  serverSeed: string;
  serverSeedHash: string;
  status: 'committed' | 'settled';
  streakBefore: number;
  createdAt: number;
  reveal: Record<string, unknown> | null;
}

const rounds = new Map<string, RpsRound>();
const memoryStreak = new Map<string, number>();
const memoryNonce = new Map<string, number>();

const rpsConfig: RpsConfig = config.rps;

async function getStreak(userId: string): Promise<number> {
  let value: string | null = null;
  try {
    value = await redis.get(`rps:streak:${userId}`);
  } catch {
    value = null;
  }
  if (value !== null) {
    const parsed = parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return memoryStreak.get(userId) ?? 0;
}

async function setStreak(userId: string, value: number): Promise<void> {
  memoryStreak.set(userId, Math.max(0, value));
  try {
    if (value > 0) {
      await redis.set(`rps:streak:${userId}`, String(value));
    } else {
      await redis.del(`rps:streak:${userId}`);
    }
  } catch {
    memoryStreak.set(userId, Math.max(0, value));
  }
}

async function nextNonce(userId: string): Promise<number> {
  let value: number | null = null;
  try {
    const result = await redis.incr(`rps:nonce:${userId}`);
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

function publicRound(round: RpsRound): Record<string, unknown> {
  return {
    kind: 'rps',
    roundId: round.id,
    status: round.status,
    stake: round.stake,
    currency: round.currency,
    clientSeed: round.clientSeed,
    nonce: round.nonce,
    serverSeedHash: round.serverSeedHash,
    streakBefore: round.streakBefore,
    createdAt: round.createdAt,
    reveal: round.reveal,
  };
}

async function validateStake(userId: string, currency: CurrencyType, stake: string): Promise<void> {
  const game = await resolveGame(GameType.ROCK_PAPER_SCISSORS);
  if (CryptoMath.isLessThan(stake, game.minBet) || CryptoMath.isGreaterThan(stake, game.maxBet)) {
    throw new ValidationError(`Stake must be between ${game.minBet} and ${game.maxBet}`);
  }
  const validation = await balanceService.validateSufficientBalance(userId, currency, stake);
  if (!validation.sufficient) {
    throw new InsufficientBalanceError(currency, stake, validation.currentBalance);
  }
}

function sweepSettledRounds(now: number): void {
  const cutoff = now - 60 * 60 * 1000;
  for (const [id, round] of rounds) {
    if (round.status === 'settled' && round.createdAt < cutoff) {
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
  sweepSettledRounds(Date.now());
  await validateStake(userId, currency, stake);

  const serverSeed = generateSeed(32);
  const serverSeedHash = await hashServerSeed(serverSeed);
  const seed = clientSeed || generateSeed(16);
  const nonce = await nextNonce(userId);
  const streak = await getStreak(userId);
  const id = generateSessionId();

  const round: RpsRound = {
    id,
    userId,
    stake,
    currency,
    clientSeed: seed,
    nonce,
    serverSeed,
    serverSeedHash,
    status: 'committed',
    streakBefore: streak,
    createdAt: Date.now(),
    reveal: null,
  };
  rounds.set(id, round);
  logger.info('RPS round created', { roundId: id, userId, streak });

  return {
    ...publicRound(round),
    streak,
    baseWinMultiplier: rpsConfig.baseWinMultiplier,
    maxStreakMultiplier: rpsConfig.maxStreakMultiplier,
  };
}

export async function choose(roundId: string, userId: string, choice: string): Promise<Record<string, unknown>> {
  const round = rounds.get(roundId);
  if (!round) throw new NotFoundError('RPS round');
  if (round.userId !== userId) throw new AppError('Unauthorized', 403, 'UNAUTHORIZED');
  if (round.status !== 'committed') throw new AppError('Round already settled', 400, 'ROUND_SETTLED');
  if (!isRpsMove(choice)) throw new ValidationError('choice must be rock, paper or scissors');
  const playerMove: RpsMove = choice;

  await validateStake(userId, round.currency, round.stake);
  await lockStake(userId, round.currency, round.stake, GameType.ROCK_PAPER_SCISSORS, round.id, { round: round.id });

  const digest = await computeDigest(round.serverSeed, round.clientSeed, round.nonce);
  const float = digestToFloat(digest);
  const houseMove = houseMoveFromFloat(float);
  const outcome: RpsOutcome = rpsOutcome(playerMove, houseMove);
  const payout = rpsPayout(round.stake, outcome, round.streakBefore, rpsConfig);

  const settleOutcome = outcome === 'win' ? 'win' : outcome === 'loss' ? 'loss' : 'refund';
  const reveal = {
    playerMove,
    houseMove,
    outcome,
    payout: payout.payout,
    net: payout.net,
    multiplier: payout.multiplier,
    streakBefore: round.streakBefore,
    streakAfter: payout.streakAfter,
    digest,
    float,
    serverSeed: round.serverSeed,
    serverSeedHash: round.serverSeedHash,
    clientSeed: round.clientSeed,
    nonce: round.nonce,
  };

  const { balance } = await finalizeBet({
    userId,
    currency: round.currency,
    stake: round.stake,
    payout: payout.payout,
    outcome: settleOutcome,
    sessionId: round.id,
    gameType: GameType.ROCK_PAPER_SCISSORS,
    result: reveal,
    seed: round.serverSeed,
    clientSeed: round.clientSeed,
    nonce: round.nonce,
    metadata: { round: round.id, streakBefore: round.streakBefore, streakAfter: payout.streakAfter },
  });

  await setStreak(userId, payout.streakAfter);
  round.status = 'settled';
  round.reveal = reveal;

  logger.info('RPS round settled', { roundId: round.id, userId, outcome, payout: payout.payout });

  const response = { ...publicRound(round), balance };
  emitToUser(userId, 'rps:round', response);
  return response;
}

export function getRound(roundId: string, userId: string): Record<string, unknown> {
  const round = rounds.get(roundId);
  if (!round || round.userId !== userId) throw new NotFoundError('RPS round');
  return publicRound(round);
}

export async function getStreakForUser(userId: string): Promise<Record<string, unknown>> {
  const streak = await getStreak(userId);
  return {
    streak,
    nextMultiplier: rpsPayout('1', 'win', streak, rpsConfig).multiplier,
    maxStreakMultiplier: rpsConfig.maxStreakMultiplier,
  };
}
