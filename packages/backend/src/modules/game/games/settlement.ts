import { GameType, TransactionType, TransactionStatus, GameStatus, CurrencyType, Prisma } from '@prisma/client';
import { prisma } from '../../../services/prisma';
import { balanceService } from '../../../services/balance';
import { logger } from '../../../services/logger';
import { NotFoundError } from '../../../middleware/errorHandler';

export interface ResolvedGame {
  id: string;
  name: string;
  minBet: string;
  maxBet: string;
}

const resolvedCache = new Map<string, ResolvedGame>();

export async function resolveGame(type: GameType): Promise<ResolvedGame> {
  const cached = resolvedCache.get(type);
  if (cached) return cached;
  const game = await prisma.game.findFirst({ where: { type } });
  if (!game) {
    throw new NotFoundError('Game');
  }
  const resolved: ResolvedGame = {
    id: game.id,
    name: game.name,
    minBet: game.minBet.toString(),
    maxBet: game.maxBet.toString(),
  };
  resolvedCache.set(type, resolved);
  return resolved;
}

export async function resolveGameId(type: GameType): Promise<string> {
  const resolved = await resolveGame(type);
  return resolved.id;
}

export function clearGameIdCache(): void {
  resolvedCache.clear();
}

export type SettleOutcome = 'win' | 'loss' | 'refund';

export interface FinalizeBetParams {
  userId: string;
  currency: CurrencyType;
  stake: string;
  payout: string;
  outcome: SettleOutcome;
  sessionId: string;
  gameType: GameType;
  result: Record<string, unknown>;
  seed?: string;
  clientSeed?: string;
  nonce?: number;
  startedAt?: Date;
  metadata?: Record<string, unknown>;
}

export async function finalizeBet(params: FinalizeBetParams): Promise<{ balance: string; winAmount: string }> {
  const gameId = await resolveGameId(params.gameType);
  const now = new Date();
  const winAmount = params.outcome === 'win' ? params.payout : '0';

  const balance = await prisma.$transaction(async (tx) => {
    if (params.outcome === 'refund') {
      await balanceService.unlockBalance(params.userId, params.currency, params.stake, tx);
    } else {
      await balanceService.confirmLockedBalance(params.userId, params.currency, params.stake, tx);
      if (params.outcome === 'win') {
        await balanceService.addBalance(params.userId, params.currency, params.payout, tx);
      }
    }

    const wagerTxs = await tx.transaction.findMany({
      where: {
        userId: params.userId,
        type: TransactionType.WAGER,
        status: TransactionStatus.PENDING,
        metadata: { path: ['sessionId'], equals: params.sessionId },
      },
      select: { id: true },
    });
    for (const wagerTx of wagerTxs) {
      await tx.transaction.update({
        where: { id: wagerTx.id },
        data: { status: TransactionStatus.COMPLETED, processedAt: now },
      });
    }

    if (params.outcome === 'win') {
      await tx.transaction.create({
        data: {
          userId: params.userId,
          type: TransactionType.WIN,
          status: TransactionStatus.COMPLETED,
          currency: params.currency,
          amount: params.payout,
          fee: '0',
          netAmount: params.payout,
          description: `Win from ${params.gameType}`,
          metadata: { sessionId: params.sessionId, gameId, ...params.metadata },
          processedAt: now,
        },
      });
    }

    await tx.gameHistory.create({
      data: {
        userId: params.userId,
        gameId,
        sessionId: params.sessionId,
        betAmount: params.stake,
        currency: params.currency,
        winAmount,
        result: params.result as Prisma.InputJsonValue,
        seed: params.seed,
        clientSeed: params.clientSeed,
        nonce: params.nonce || 0,
        status: params.outcome === 'refund' ? GameStatus.CANCELLED : GameStatus.COMPLETED,
        startedAt: params.startedAt || now,
        endedAt: now,
      },
    });

    const wallet = await tx.cryptoWallet.findUnique({
      where: { userId_currency: { userId: params.userId, currency: params.currency } },
      select: { balance: true },
    });
    return wallet!.balance.toString();
  });

  logger.info('Bet finalized', {
    userId: params.userId,
    sessionId: params.sessionId,
    gameType: params.gameType,
    outcome: params.outcome,
    payout: params.payout,
  });

  return { balance, winAmount };
}

export async function lockStake(
  userId: string,
  currency: CurrencyType,
  amount: string,
  gameType: GameType,
  sessionId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const gameId = await resolveGameId(gameType);

  await prisma.$transaction(async (tx) => {
    await balanceService.lockBalance(userId, currency, amount, tx);
    await tx.transaction.create({
      data: {
        userId,
        type: TransactionType.WAGER,
        status: TransactionStatus.PENDING,
        currency,
        amount,
        fee: '0',
        netAmount: amount,
        description: `Wager on ${gameType}`,
        metadata: { sessionId, gameId, ...metadata },
        requiredConfirmations: 1,
      },
    });
  });
}
