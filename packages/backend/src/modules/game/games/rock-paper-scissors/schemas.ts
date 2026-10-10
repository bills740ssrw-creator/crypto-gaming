import { z } from 'zod';
import { CurrencyType } from '@crypto-gaming/shared';

export const createRpsRoundSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  currency: z.nativeEnum(CurrencyType),
  clientSeed: z.string().min(8).max(128).optional(),
});

export const rpsChooseSchema = z.object({
  choice: z.enum(['rock', 'paper', 'scissors']),
});

export const roundIdParamsSchema = z.object({
  roundId: z.string().min(1).max(64),
});

export type CreateRpsRoundInput = z.infer<typeof createRpsRoundSchema>;
export type RpsChooseInput = z.infer<typeof rpsChooseSchema>;
