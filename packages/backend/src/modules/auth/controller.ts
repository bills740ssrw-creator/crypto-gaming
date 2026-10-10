import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { authService } from './service';
import { AuthenticatedRequest } from '../../middleware/auth';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.register(req.body);
  res.status(201).json({ success: true, data: result });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body);
  res.json({ success: true, data: result });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  const tokens = await authService.refreshTokens(refreshToken);
  res.json({ success: true, data: tokens });
});

export const logout = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { refreshToken } = req.body;
  await authService.logout(req.userId!, refreshToken);
  res.json({ success: true, message: 'Logged out successfully' });
});

export const changePassword = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await authService.changePassword(req.userId!, req.body);
  res.json({ success: true, message: 'Password changed successfully' });
});

export const updateProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await authService.updateProfile(req.userId!, req.body);
  res.json({ success: true, data: user });
});

export const getProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await authService.getProfile(req.userId!);
  if (!user) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    return;
  }
  res.json({ success: true, data: user });
});

export const submitKYC = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await authService.submitKYC(req.userId!, req.body);
  res.json({ success: true, message: 'KYC submitted successfully' });
});

export const deleteAccount = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await authService.deleteAccount(req.userId!, req.body.password);
  res.json({ success: true, message: 'Account deleted successfully' });
});