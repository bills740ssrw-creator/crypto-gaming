import { Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { walletService } from './service';
import { AuthenticatedRequest } from '../../middleware/auth';

export const getWallets = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const wallets = await walletService.getWallets(req.userId!);
  res.json({ success: true, data: wallets });
});

export const getWallet = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { currency } = req.params;
  const wallet = await walletService.getWallet(req.userId!, currency as any);
  if (!wallet) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Wallet not found' } });
    return;
  }
  res.json({ success: true, data: wallet });
});

export const createWallet = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const wallet = await walletService.createWallet(req.userId!, req.body);
  res.status(201).json({ success: true, data: wallet });
});

export const getBalance = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { currency } = req.query;
  const balance = await walletService.getBalance(req.userId!, currency as any);
  res.json({ success: true, data: balance });
});

export const requestDeposit = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await walletService.requestDeposit(req.userId!, req.body);
  res.json({ success: true, data: result });
});

export const requestWithdrawal = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await walletService.requestWithdrawal(req.userId!, req.body);
  res.json({ success: true, data: result });
});

export const transfer = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await walletService.transfer(req.userId!, req.body);
  res.json({ success: true, data: result });
});

export const getTransactionHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { currency, limit, offset } = req.query;
  const result = await walletService.getTransactionHistory(req.userId!, {
    currency: currency as any,
    limit: limit ? parseInt(limit as string) : 50,
    offset: offset ? parseInt(offset as string) : 0,
  });
  res.json({ success: true, data: result });
});