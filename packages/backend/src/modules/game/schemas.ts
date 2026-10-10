import { z } from 'zod';
import { CurrencyType, GameType } from '@crypto-gaming/shared';

export const createGameSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.nativeEnum(GameType),
  provider: z.string().min(1).max(50),
  minBet: z.string().regex(/^\d+(\.\d+)?$/),
  maxBet: z.string().regex(/^\d+(\.\d+)?$/),
  rtp: z.number().min(0).max(100),
  volatility: z.enum(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']),
  isProvablyFair: z.boolean().default(false),
  config: z.record(z.unknown()).default({}),
});

export const startGameSessionSchema = z.object({
  gameId: z.string().uuid(),
  currency: z.nativeEnum(CurrencyType),
  initialBet: z.string().regex(/^\d+(\.\d+)?$/).optional(),
});

export const placeBetSchema = z.object({
  sessionId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  gameData: z.record(z.unknown()).default({}),
});

export const endGameSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

export const getGameHistorySchema = z.object({
  gameId: z.string().uuid().optional(),
  currency: z.nativeEnum(CurrencyType).optional(),
  status: z.enum(['WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  limit: z.number().int().positive().max(100).default(50),
  offset: z.number().int().nonnegative().default(0),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const getGamesSchema = z.object({
  type: z.nativeEnum(GameType).optional(),
  provider: z.string().optional(),
  isActive: z.boolean().optional(),
  limit: z.number().int().positive().max(100).default(50),
  offset: z.number().int().nonnegative().default(0),
});

export type CreateGameInput = z.infer<typeof createGameSchema>;
export type StartGameSessionInput = z.infer<typeof startGameSessionSchema>;
export type PlaceBetInput = z.infer<typeof placeBetSchema>;
export type EndGameSessionInput = z.infer<typeof endGameSessionSchema>;
export type GetGameHistoryInput = z.infer<typeof getGameHistorySchema>;
export type GetGamesInput = z.infer<typeof getGamesSchema>;