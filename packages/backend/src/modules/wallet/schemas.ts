import { z } from 'zod';
import { CurrencyType } from '@crypto-gaming/shared';

export const createWalletSchema = z.object({
  currency: z.nativeEnum(CurrencyType),
  walletType: z.enum(['HOT', 'COLD', 'DEPOSIT', 'WITHDRAWAL']).default('HOT'),
});

export const depositSchema = z.object({
  currency: z.nativeEnum(CurrencyType),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  network: z.string().optional(),
});

export const withdrawalSchema = z.object({
  currency: z.nativeEnum(CurrencyType),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  address: z.string().min(1),
  tag: z.string().optional(),
  network: z.string().optional(),
});

export const transferSchema = z.object({
  toUserId: z.string().uuid(),
  currency: z.nativeEnum(CurrencyType),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
});

export const getBalanceSchema = z.object({
  currency: z.nativeEnum(CurrencyType).optional(),
});

export type CreateWalletInput = z.infer<typeof createWalletSchema>;
export type DepositInput = z.infer<typeof depositSchema>;
export type WithdrawalInput = z.infer<typeof withdrawalSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type GetBalanceInput = z.infer<typeof getBalanceSchema>;