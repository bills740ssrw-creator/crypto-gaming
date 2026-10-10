import { z } from 'zod';
import { CurrencyType } from '@crypto-gaming/shared';

export const createPathRoundSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  currency: z.nativeEnum(CurrencyType),
  clientSeed: z.string().min(8).max(128).optional(),
});

export const roundIdParamsSchema = z.object({
  roundId: z.string().min(1).max(64),
});

export type CreatePathRoundInput = z.infer<typeof createPathRoundSchema>;
