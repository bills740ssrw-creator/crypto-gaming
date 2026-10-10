import { Prisma, Game, GameSession, GameHistory, GameStatus, TransactionType, TransactionStatus } from '@prisma/client';
import { prisma } from '../../services/prisma';
import { balanceService } from '../../services/balance';
import { logger } from '../../services/logger';
import { AppError, NotFoundError, InsufficientBalanceError } from '../../middleware/errorHandler';
import { CryptoMath, GameType } from '@crypto-gaming/shared';
import { CreateGameInput, StartGameSessionInput, PlaceBetInput, GetGameHistoryInput, GetGamesInput } from './schemas';

export class GameService {
  private static instance: GameService;

  private constructor() {}

  static getInstance(): GameService {
    if (!GameService.instance) {
      GameService.instance = new GameService();
    }
    return GameService.instance;
  }

  async getGames(options: Partial<GetGamesInput> = {}): Promise<{ games: Game[]; total: number }> {
    const { type, provider, isActive, limit = 50, offset = 0 } = options;

    const where: any = {};
    if (type) where.type = type;
    if (provider) where.provider = provider;
    if (isActive !== undefined) where.isActive = isActive;

    const [games, total] = await Promise.all([
      prisma.game.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.game.count({ where }),
    ]);

    return { games, total };
  }

  async getGame(gameId: string): Promise<Game | null> {
    return prisma.game.findUnique({ where: { id: gameId } });
  }

  async createGame(input: CreateGameInput): Promise<Game> {
    const game = await prisma.game.create({
      data: {
        ...input,
        config: (input.config ?? {}) as Prisma.InputJsonValue,
      },
    });
    logger.info('Game created', { gameId: game.id, name: game.name, type: game.type });
    return game;
  }

  async updateGame(gameId: string, data: Partial<CreateGameInput>): Promise<Game> {
    const { config, ...rest } = data;
    const game = await prisma.game.update({
      where: { id: gameId },
      data: {
        ...rest,
        ...(config !== undefined ? { config: config as Prisma.InputJsonValue } : {}),
      },
    });
    logger.info('Game updated', { gameId });
    return game;
  }

  async deleteGame(gameId: string): Promise<void> {
    await prisma.game.delete({ where: { id: gameId } });
    logger.info('Game deleted', { gameId });
  }

  async startGameSession(userId: string, input: StartGameSessionInput): Promise<GameSession> {
    const game = await this.getGame(input.gameId);
    if (!game) {
      throw new NotFoundError('Game');
    }

    if (!game.isActive) {
      throw new AppError('Game is not active', 400, 'GAME_INACTIVE');
    }

    const wallet = await balanceService.getWalletBalance(userId, input.currency);
    if (CryptoMath.isLessThan(wallet, game.minBet.toString())) {
      throw new InsufficientBalanceError(input.currency, game.minBet.toString(), wallet);
    }

    const session = await prisma.$transaction(async (tx) => {
      const wagerAmount = input.initialBet || game.minBet.toString();

      await balanceService.lockBalance(userId, input.currency, wagerAmount, tx);

      const session = await tx.gameSession.create({
        data: {
          userId,
          gameId: input.gameId,
          currency: input.currency,
          initialBalance: wallet,
          currentBalance: wallet,
          totalWagered: '0',
          totalWon: '0',
          betsCount: 0,
          winsCount: 0,
        },
      });

      if (input.initialBet) {
        await tx.transaction.create({
          data: {
            userId,
            type: TransactionType.WAGER,
            status: TransactionStatus.PENDING,
            currency: input.currency,
            amount: wagerAmount,
            fee: '0',
            netAmount: wagerAmount,
            description: `Initial bet on ${game.name}`,
            metadata: { sessionId: session.id, gameId: input.gameId },
            requiredConfirmations: 1,
          },
        });
      }

      return session;
    });

    logger.info('Game session started', { sessionId: session.id, userId, gameId: input.gameId, currency: input.currency });
    return session;
  }

  async placeBet(userId: string, input: PlaceBetInput): Promise<{ session: GameSession; transactionId: string }> {
    const session = await prisma.gameSession.findUnique({
      where: { id: input.sessionId },
      include: { game: true },
    });

    if (!session) {
      throw new NotFoundError('Game session');
    }

    if (session.userId !== userId) {
      throw new AppError('Unauthorized', 403, 'UNAUTHORIZED');
    }

    if (!session.isActive) {
      throw new AppError('Game session is not active', 400, 'SESSION_INACTIVE');
    }

    const validation = await balanceService.validateSufficientBalance(userId, session.currency, input.amount);
    if (!validation.sufficient) {
      throw new InsufficientBalanceError(session.currency, input.amount, validation.currentBalance);
    }

    const { session: updatedSession, transactionId } = await prisma.$transaction(async (tx) => {
      await balanceService.lockBalance(userId, session.currency, input.amount, tx);

      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.WAGER,
          status: TransactionStatus.PENDING,
          currency: session.currency,
          amount: input.amount,
          fee: '0',
          netAmount: input.amount,
          description: `Bet on ${session.game.name}`,
          metadata: {
            sessionId: session.id,
            gameId: session.gameId,
            gameData: input.gameData,
          } as Prisma.InputJsonValue,
          requiredConfirmations: 1,
        },
      });

      const updatedSession = await tx.gameSession.update({
        where: { id: session.id },
        data: {
          totalWagered: CryptoMath.add(session.totalWagered.toString(), input.amount),
          betsCount: session.betsCount + 1,
          currentBalance: CryptoMath.subtract(session.currentBalance.toString(), input.amount),
        },
      });

      return { session: updatedSession, transactionId: transaction.id };
    });

    logger.info('Bet placed', { sessionId: input.sessionId, userId, amount: input.amount, transactionId });
    return { session: updatedSession, transactionId };
  }

  async processGameResult(
    sessionId: string,
    result: Record<string, unknown>,
    winAmount: string,
    seed?: string,
    clientSeed?: string
  ): Promise<{ session: GameSession; history: GameHistory }> {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { game: true, user: true },
    });

    if (!session) {
      throw new NotFoundError('Game session');
    }

    const { session: updatedSession, history } = await prisma.$transaction(async (tx) => {
      const newBalance = CryptoMath.add(session.currentBalance.toString(), winAmount);

      const updatedSession = await tx.gameSession.update({
        where: { id: sessionId },
        data: {
          currentBalance: newBalance,
          totalWon: CryptoMath.add(session.totalWon.toString(), winAmount),
          winsCount: winAmount !== '0' ? session.winsCount + 1 : session.winsCount,
        },
      });

      if (winAmount !== '0') {
        await balanceService.addBalance(session.userId, session.currency, winAmount, tx);

        await tx.transaction.create({
          data: {
            userId: session.userId,
            type: TransactionType.WIN,
            status: TransactionStatus.COMPLETED,
            currency: session.currency,
            amount: winAmount,
            fee: '0',
            netAmount: winAmount,
            description: `Win from ${session.game.name}`,
            metadata: { sessionId, gameId: session.gameId, result } as Prisma.InputJsonValue,
            processedAt: new Date(),
          },
        });
      }

      const wagerTransactions = await tx.transaction.findMany({
        where: {
          userId: session.userId,
          type: TransactionType.WAGER,
          status: TransactionStatus.PENDING,
          metadata: { path: ['sessionId'], equals: sessionId },
        },
      });

      for (const wagerTx of wagerTransactions) {
        await tx.transaction.update({
          where: { id: wagerTx.id },
          data: { status: TransactionStatus.COMPLETED, processedAt: new Date() },
        });
      }

      const history = await tx.gameHistory.create({
        data: {
          userId: session.userId,
          gameId: session.gameId,
          sessionId,
          betAmount: session.totalWagered,
          currency: session.currency,
          winAmount,
          result: result as Prisma.InputJsonValue,
          seed,
          clientSeed,
          nonce: session.betsCount,
          status: GameStatus.COMPLETED,
          startedAt: session.startedAt,
          endedAt: new Date(),
        },
      });

      return { session: updatedSession, history };
    });

    logger.info('Game result processed', { sessionId, winAmount, userId: session.userId });
    return { session: updatedSession, history };
  }

  async endGameSession(userId: string, sessionId: string): Promise<GameSession> {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundError('Game session');
    }

    if (session.userId !== userId) {
      throw new AppError('Unauthorized', 403, 'UNAUTHORIZED');
    }

    if (!session.isActive) {
      throw new AppError('Game session is already ended', 400, 'SESSION_ALREADY_ENDED');
    }

    const updatedSession = await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        endedAt: new Date(),
      },
    });

    logger.info('Game session ended', { sessionId, userId });
    return updatedSession;
  }

  async getGameHistory(userId: string, options: Partial<GetGameHistoryInput> = {}): Promise<{ history: GameHistory[]; total: number }> {
    const { gameId, currency, status, limit = 50, offset = 0, startDate, endDate } = options;

    const where: any = { userId };
    if (gameId) where.gameId = gameId;
    if (currency) where.currency = currency;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.startedAt = {};
      if (startDate) where.startedAt.gte = new Date(startDate);
      if (endDate) where.startedAt.lte = new Date(endDate);
    }

    const [history, total] = await Promise.all([
      prisma.gameHistory.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset,
        include: { game: true },
      }),
      prisma.gameHistory.count({ where }),
    ]);

    return { history, total };
  }

  async getActiveSession(userId: string, gameId: string): Promise<GameSession | null> {
    return prisma.gameSession.findFirst({
      where: { userId, gameId, isActive: true },
      orderBy: { startedAt: 'desc' },
    });
  }

  async getSession(sessionId: string): Promise<GameSession | null> {
    return prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { game: true },
    });
  }

  async getSessionStats(userId: string, gameId?: string) {
    const where: any = { userId };
    if (gameId) where.gameId = gameId;

    const sessions = await prisma.gameSession.findMany({
      where,
      select: {
        totalWagered: true,
        totalWon: true,
        betsCount: true,
        winsCount: true,
        currency: true,
      },
    });

    const stats = sessions.reduce((acc, session) => {
      const currency = session.currency;
      if (!acc[currency]) {
        acc[currency] = { totalWagered: '0', totalWon: '0', betsCount: 0, winsCount: 0 };
      }
      acc[currency].totalWagered = CryptoMath.add(acc[currency].totalWagered, session.totalWagered.toString());
      acc[currency].totalWon = CryptoMath.add(acc[currency].totalWon, session.totalWon.toString());
      acc[currency].betsCount += session.betsCount;
      acc[currency].winsCount += session.winsCount;
      return acc;
    }, {} as Record<string, { totalWagered: string; totalWon: string; betsCount: number; winsCount: number }>);

    return stats;
  }

  async initializeDefaultGames(): Promise<void> {
    const defaultGames: CreateGameInput[] = [
      {
        name: 'Classic Slots',
        type: GameType.SLOTS,
        provider: 'Internal',
        minBet: '0.10',
        maxBet: '100.00',
        rtp: 96.5,
        volatility: 'MEDIUM',
        isProvablyFair: true,
        config: { reels: 5, rows: 3, paylines: 20 },
      },
      {
        name: 'Blackjack Classic',
        type: GameType.BLACKJACK,
        provider: 'Internal',
        minBet: '1.00',
        maxBet: '500.00',
        rtp: 99.5,
        volatility: 'LOW',
        isProvablyFair: true,
        config: { decks: 6, blackjackPays: '3:2' },
      },
      {
        name: 'European Roulette',
        type: GameType.ROULETTE,
        provider: 'Internal',
        minBet: '0.50',
        maxBet: '200.00',
        rtp: 97.3,
        volatility: 'LOW',
        isProvablyFair: true,
        config: { variant: 'european', zeroCount: 1 },
      },
      {
        name: 'Texas Hold\'em Poker',
        type: GameType.POKER,
        provider: 'Internal',
        minBet: '5.00',
        maxBet: '1000.00',
        rtp: 98.0,
        volatility: 'HIGH',
        isProvablyFair: true,
        config: { variant: 'texas_holdem', maxPlayers: 6 },
      },
      {
        name: 'Baccarat',
        type: GameType.BACCARAT,
        provider: 'Internal',
        minBet: '1.00',
        maxBet: '500.00',
        rtp: 98.9,
        volatility: 'LOW',
        isProvablyFair: true,
        config: { variant: 'punto_banco', commission: 0.05 },
      },
      {
        name: 'Dice',
        type: GameType.DICE,
        provider: 'Internal',
        minBet: '0.01',
        maxBet: '100.00',
        rtp: 99.0,
        volatility: 'VERY_HIGH',
        isProvablyFair: true,
        config: { sides: 100 },
      },
      {
        name: 'Crash',
        type: GameType.CRASH,
        provider: 'Internal',
        minBet: '0.10',
        maxBet: '100.00',
        rtp: 97.0,
        volatility: 'VERY_HIGH',
        isProvablyFair: true,
        config: { maxMultiplier: 1000 },
      },
      {
        name: 'Plinko',
        type: GameType.PLINKO,
        provider: 'Internal',
        minBet: '0.10',
        maxBet: '100.00',
        rtp: 96.0,
        volatility: 'HIGH',
        isProvablyFair: true,
        config: { rows: 16, risk: 'medium' },
      },
      {
        name: 'Mines',
        type: GameType.MINES,
        provider: 'Internal',
        minBet: '0.10',
        maxBet: '100.00',
        rtp: 95.0,
        volatility: 'HIGH',
        isProvablyFair: true,
        config: { gridSize: 5, mines: 3 },
      },
      {
        name: 'Keno',
        type: GameType.KENO,
        provider: 'Internal',
        minBet: '0.10',
        maxBet: '50.00',
        rtp: 94.0,
        volatility: 'MEDIUM',
        isProvablyFair: true,
        config: { numbers: 80, picks: 10 },
      },
      {
        name: 'Tic-Tac-Toe PvP',
        type: GameType.TIC_TAC_TOE,
        provider: 'Internal',
        minBet: '1.00',
        maxBet: '500.00',
        rtp: 96.0,
        volatility: 'LOW',
        isProvablyFair: false,
        config: { moveTimeoutMs: 3000, maxTokensPerPlayer: 3, rakePercent: 4 },
      },
      {
        name: 'Rock Paper Scissors',
        type: GameType.ROCK_PAPER_SCISSORS,
        provider: 'Internal',
        minBet: '0.50',
        maxBet: '250.00',
        rtp: 97.5,
        volatility: 'MEDIUM',
        isProvablyFair: true,
        config: { baseWinMultiplier: 1.95, streakBonusStep: 0.1, maxStreakMultiplier: 1.5 },
      },
      {
        name: 'Path Elimination',
        type: GameType.PATH_ELIMINATION,
        provider: 'Internal',
        minBet: '0.50',
        maxBet: '250.00',
        rtp: 96.0,
        volatility: 'HIGH',
        isProvablyFair: true,
        config: {
          rows: [
            { winProbability: 0.95, multiplier: 1.0105 },
            { winProbability: 0.85, multiplier: 1.1294 },
            { winProbability: 0.7, multiplier: 1.3714 },
            { winProbability: 0.55, multiplier: 1.7455 },
            { winProbability: 0.4, multiplier: 2.4 },
          ],
        },
      },
    ];

    for (const gameData of defaultGames) {
      const existing = await prisma.game.findFirst({
        where: { name: gameData.name, provider: gameData.provider },
      });
      if (!existing) {
        await this.createGame(gameData);
      }
    }
  }
}

export const gameService = GameService.getInstance();