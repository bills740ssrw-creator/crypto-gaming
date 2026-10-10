import { z } from 'zod';
import { CurrencyType } from '@crypto-gaming/shared';

export const createTttRoomSchema = z.object({
  stake: z.string().regex(/^\d+(\.\d+)?$/),
  currency: z.nativeEnum(CurrencyType),
});

export const tttMoveSchema = z.object({
  cell: z.number().int().min(0).max(8),
});

export const roomIdParamsSchema = z.object({
  roomId: z.string().min(1).max(64),
});

export const listTttRoomsQuerySchema = z.object({
  currency: z.nativeEnum(CurrencyType).optional(),
});

export type CreateTttRoomInput = z.infer<typeof createTttRoomSchema>;
export type TttMoveInput = z.infer<typeof tttMoveSchema>;
export type ListTttRoomsQuery = z.infer<typeof listTttRoomsQuerySchema>;
