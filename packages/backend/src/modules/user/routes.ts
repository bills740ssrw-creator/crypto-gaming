import { Router } from 'express';
import { z } from 'zod';
import { validateQuery } from '../../middleware/validation';
import { authenticate, requireAdmin, requireUserId, AuthenticatedRequest } from '../../middleware/auth';
import { apiRateLimit } from '../../middleware/rateLimit';
import { prisma } from '../../services/prisma';
import { logger } from '../../services/logger';
import { asyncHandler } from '../../middleware/errorHandler';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);
router.use(apiRateLimit);

const listUsersQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  region: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

router.get('/', validateQuery(listUsersQuery), asyncHandler(async (req, res) => {
  const { page, limit, search, region, isActive } = listUsersQuery.parse(req.query);
  
  const where: any = {};
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { username: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (region) where.region = region;
  if (isActive !== undefined) where.isActive = isActive;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
      select: {
        id: true,
        email: true,
        username: true,
        region: true,
        kycVerified: true,
        kycLevel: true,
        isActive: true,
        isAdmin: true,
        referralCode: true,
        lastLoginAt: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({
    success: true,
    data: {
      items: users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      email: true,
      username: true,
      region: true,
      kycVerified: true,
      kycLevel: true,
      isActive: true,
      isAdmin: true,
      referralCode: true,
      referredBy: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { wallets: true, transactions: true, gameHistory: true, gameSessions: true },
      },
    },
  });

  if (!user) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    return;
  }

  res.json({ success: true, data: user });
}));

router.patch('/:id/activate', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive: true },
  });
  logger.info('User activated', { userId: user.id, adminId: requireUserId(req) });
  res.json({ success: true, data: { id: user.id, isActive: user.isActive } });
}));

router.patch('/:id/deactivate', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  logger.info('User deactivated', { userId: user.id, adminId: requireUserId(req) });
  res.json({ success: true, data: { id: user.id, isActive: user.isActive } });
}));

router.patch('/:id/kyc', asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { level, verified } = req.body;
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { kycLevel: level, kycVerified: verified },
  });
  logger.info('User KYC updated', { userId: user.id, level, verified, adminId: requireUserId(req) });
  res.json({ success: true, data: { id: user.id, kycLevel: user.kycLevel, kycVerified: user.kycVerified } });
}));

const listTransactionsQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  type: z.string().optional(),
  status: z.string().optional(),
  currency: z.string().optional(),
});

router.get('/:id/transactions', validateQuery(listTransactionsQuery), asyncHandler(async (req, res) => {
  const { page, limit, type, status, currency } = listTransactionsQuery.parse(req.query);
  
  const where: any = { userId: req.params.id };
  if (type) where.type = type;
  if (status) where.status = status;
  if (currency) where.currency = currency;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  res.json({
    success: true,
    data: {
      items: transactions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  });
}));

router.get('/:id/wallets', asyncHandler(async (req, res) => {
  const wallets = await prisma.cryptoWallet.findMany({
    where: { userId: req.params.id },
    orderBy: { currency: 'asc' },
  });
  res.json({ success: true, data: wallets });
}));

const listGameHistoryQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  gameId: z.string().optional(),
  currency: z.string().optional(),
});

router.get('/:id/game-history', validateQuery(listGameHistoryQuery), asyncHandler(async (req, res) => {
  const { page, limit, gameId, currency } = listGameHistoryQuery.parse(req.query);
  
  const where: any = { userId: req.params.id };
  if (gameId) where.gameId = gameId;
  if (currency) where.currency = currency;

  const [history, total] = await Promise.all([
    prisma.gameHistory.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
      include: { game: true },
    }),
    prisma.gameHistory.count({ where }),
  ]);

  res.json({
    success: true,
    data: {
      items: history,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  });
}));

router.get('/:id/stats', asyncHandler(async (req, res) => {
  const [walletCount, txCount, gameCount, totalWagered, totalWon] = await Promise.all([
    prisma.cryptoWallet.count({ where: { userId: req.params.id, isActive: true } }),
    prisma.transaction.count({ where: { userId: req.params.id } }),
    prisma.gameHistory.count({ where: { userId: req.params.id } }),
    prisma.gameHistory.aggregate({
      where: { userId: req.params.id },
      _sum: { betAmount: true },
    }),
    prisma.gameHistory.aggregate({
      where: { userId: req.params.id },
      _sum: { winAmount: true },
    }),
  ]);

  res.json({
    success: true,
    data: {
      walletCount,
      transactionCount: txCount,
      gameCount,
      totalWagered: totalWagered._sum.betAmount?.toString() || '0',
      totalWon: totalWon._sum.winAmount?.toString() || '0',
    },
  });
}));

export default router;