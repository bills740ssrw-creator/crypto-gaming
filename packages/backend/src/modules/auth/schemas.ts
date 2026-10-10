import { z } from 'zod';
import { RegionType, CurrencyType } from '@crypto-gaming/shared';

export const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(128),
  region: z.nativeEnum(RegionType).default(RegionType.GLOBAL),
  referralCode: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(128),
});

export const updateProfileSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
  email: z.string().email().optional(),
});

export const kycSchema = z.object({
  level: z.number().int().min(1).max(3),
  documentType: z.enum(['PASSPORT', 'DRIVERS_LICENSE', 'NATIONAL_ID']),
  documentNumber: z.string(),
  documentFront: z.string(),
  documentBack: z.string().optional(),
  selfie: z.string(),
});

export const requestWithdrawalSchema = z.object({
  currency: z.nativeEnum(CurrencyType),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  address: z.string().min(1),
  tag: z.string().optional(),
  network: z.string().optional(),
});

export const requestDepositSchema = z.object({
  currency: z.nativeEnum(CurrencyType),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  network: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type KYCInput = z.infer<typeof kycSchema>;
export type RequestWithdrawalInput = z.infer<typeof requestWithdrawalSchema>;
export type RequestDepositInput = z.infer<typeof requestDepositSchema>;