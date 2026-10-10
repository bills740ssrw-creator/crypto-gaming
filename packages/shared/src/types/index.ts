import { z } from 'zod';

export const CurrencyType = {
  GOLD_COINS: 'GOLD_COINS',
  SWEEPS_COINS: 'SWEEPS_COINS',
  CRYPTO_BTC: 'CRYPTO_BTC',
  CRYPTO_ETH: 'CRYPTO_ETH',
  CRYPTO_USDT: 'CRYPTO_USDT',
  CRYPTO_USDC: 'CRYPTO_USDC',
  CRYPTO_LTC: 'CRYPTO_LTC',
  CRYPTO_DOGE: 'CRYPTO_DOGE',
  CRYPTO_SOL: 'CRYPTO_SOL',
} as const;
export type CurrencyType = (typeof CurrencyType)[keyof typeof CurrencyType];

export const RegionType = {
  US: 'US',
  GLOBAL: 'GLOBAL',
} as const;
export type RegionType = (typeof RegionType)[keyof typeof RegionType];

export const TransactionType = {
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
  WAGER: 'WAGER',
  WIN: 'WIN',
  BONUS: 'BONUS',
  REFUND: 'REFUND',
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT',
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const TransactionStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  CONFIRMED: 'CONFIRMED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
} as const;
export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];

export const GameStatus = {
  WAITING: 'WAITING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type GameStatus = (typeof GameStatus)[keyof typeof GameStatus];

export const GameType = {
  SLOTS: 'SLOTS',
  BLACKJACK: 'BLACKJACK',
  ROULETTE: 'ROULETTE',
  POKER: 'POKER',
  BACCARAT: 'BACCARAT',
  DICE: 'DICE',
  CRASH: 'CRASH',
  PLINKO: 'PLINKO',
  MINES: 'MINES',
  KENO: 'KENO',
  TIC_TAC_TOE: 'TIC_TAC_TOE',
  ROCK_PAPER_SCISSORS: 'ROCK_PAPER_SCISSORS',
  PATH_ELIMINATION: 'PATH_ELIMINATION',
} as const;
export type GameType = (typeof GameType)[keyof typeof GameType];

export const WalletType = {
  HOT: 'HOT',
  COLD: 'COLD',
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
} as const;
export type WalletType = (typeof WalletType)[keyof typeof WalletType];

export const CurrencyTypeSchema = z.nativeEnum(CurrencyType);
export const RegionTypeSchema = z.nativeEnum(RegionType);
export const TransactionTypeSchema = z.nativeEnum(TransactionType);
export const TransactionStatusSchema = z.nativeEnum(TransactionStatus);
export const GameStatusSchema = z.nativeEnum(GameStatus);
export const GameTypeSchema = z.nativeEnum(GameType);
export const WalletTypeSchema = z.nativeEnum(WalletType);

export const BalanceSchema = z.object({
  goldCoins: z.string().default('0'),
  sweepsCoins: z.string().default('0'),
  cryptoBalances: z.record(z.string()).default({}),
  region: RegionTypeSchema,
  updatedAt: z.date(),
});

export type Balance = z.infer<typeof BalanceSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  username: z.string().min(3).max(30),
  passwordHash: z.string(),
  region: RegionTypeSchema,
  kycVerified: z.boolean().default(false),
  kycLevel: z.number().int().min(0).max(3).default(0),
  isActive: z.boolean().default(true),
  isAdmin: z.boolean().default(false),
  referralCode: z.string().optional(),
  referredBy: z.string().uuid().optional(),
  lastLoginAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

export const CryptoWalletSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  currency: CurrencyTypeSchema,
  address: z.string(),
  derivationPath: z.string().optional(),
  walletType: WalletTypeSchema,
  isActive: z.boolean().default(true),
  balance: z.string().default('0'),
  pendingBalance: z.string().default('0'),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CryptoWallet = z.infer<typeof CryptoWalletSchema>;

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  walletId: z.string().uuid().optional(),
  type: TransactionTypeSchema,
  status: TransactionStatusSchema,
  currency: CurrencyTypeSchema,
  amount: z.string(),
  fee: z.string().default('0'),
  netAmount: z.string(),
  description: z.string().optional(),
  referenceId: z.string().optional(),
  blockHash: z.string().optional(),
  blockNumber: z.number().int().optional(),
  txHash: z.string().optional(),
  confirmations: z.number().int().default(0),
  requiredConfirmations: z.number().int().default(1),
  metadata: z.record(z.unknown()).default({}),
  processedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Transaction = z.infer<typeof TransactionSchema>;

export const GameSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: GameTypeSchema,
  provider: z.string(),
  minBet: z.string(),
  maxBet: z.string(),
  rtp: z.number().min(0).max(100),
  volatility: z.enum(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']),
  isActive: z.boolean().default(true),
  isProvablyFair: z.boolean().default(false),
  config: z.record(z.unknown()).default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Game = z.infer<typeof GameSchema>;

export const GameHistorySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  gameId: z.string().uuid(),
  sessionId: z.string().uuid(),
  betAmount: z.string(),
  currency: CurrencyTypeSchema,
  winAmount: z.string().default('0'),
  result: z.record(z.unknown()),
  seed: z.string().optional(),
  clientSeed: z.string().optional(),
  nonce: z.number().int().default(0),
  status: GameStatusSchema,
  startedAt: z.date(),
  endedAt: z.date().optional(),
  createdAt: z.date(),
});

export type GameHistory = z.infer<typeof GameHistorySchema>;

export const GameSessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  gameId: z.string().uuid(),
  currency: CurrencyTypeSchema,
  initialBalance: z.string(),
  currentBalance: z.string(),
  totalWagered: z.string().default('0'),
  totalWon: z.string().default('0'),
  betsCount: z.number().int().default(0),
  winsCount: z.number().int().default(0),
  isActive: z.boolean().default(true),
  startedAt: z.date(),
  endedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type GameSession = z.infer<typeof GameSessionSchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});

export type AuthTokens = z.infer<typeof AuthTokensSchema>;

export const JWTPayloadSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  username: z.string(),
  region: RegionTypeSchema,
  isAdmin: z.boolean(),
  kycLevel: z.number().int().min(0).default(0),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

export type JWTPayload = z.infer<typeof JWTPayloadSchema>;

export const WebSocketMessageSchema = z.object({
  type: z.string(),
  payload: z.record(z.unknown()),
  timestamp: z.number(),
  requestId: z.string().optional(),
});

export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

export const BalanceUpdateMessageSchema = z.object({
  type: z.literal('BALANCE_UPDATE'),
  payload: z.object({
    goldCoins: z.string().optional(),
    sweepsCoins: z.string().optional(),
    cryptoBalances: z.record(z.string()).optional(),
  }),
  timestamp: z.number(),
});

export type BalanceUpdateMessage = z.infer<typeof BalanceUpdateMessageSchema>;

export const GameUpdateMessageSchema = z.object({
  type: z.literal('GAME_UPDATE'),
  payload: z.object({
    sessionId: z.string().uuid(),
    gameId: z.string().uuid(),
    result: z.record(z.unknown()),
    winAmount: z.string(),
    newBalance: z.string(),
    currency: CurrencyTypeSchema,
  }),
  timestamp: z.number(),
});

export type GameUpdateMessage = z.infer<typeof GameUpdateMessageSchema>;

export const TransactionUpdateMessageSchema = z.object({
  type: z.literal('TRANSACTION_UPDATE'),
  payload: TransactionSchema,
  timestamp: z.number(),
});

export type TransactionUpdateMessage = z.infer<typeof TransactionUpdateMessageSchema>;

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.unknown()).optional(),
    }).optional(),
    meta: z.object({
      timestamp: z.number(),
      requestId: z.string().optional(),
      pagination: z.object({
        page: z.number().int().positive(),
        limit: z.number().int().positive(),
        total: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }).optional(),
    }).optional(),
  });

export type ApiResponse<T> = z.infer<ReturnType<typeof ApiResponseSchema<z.ZodTypeAny>>> & { data?: T };

export const PaginationParamsSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationParams = z.infer<typeof PaginationParamsSchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  ApiResponseSchema(z.object({
    items: z.array(itemSchema),
    pagination: z.object({
      page: z.number().int().positive(),
      limit: z.number().int().positive(),
      total: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
    }),
  }));

export type PaginatedResponse<T> = z.infer<ReturnType<typeof PaginatedResponseSchema<z.ZodTypeAny>>> & { data?: { items: T[]; pagination: PaginationParams & { total: number; totalPages: number } } };