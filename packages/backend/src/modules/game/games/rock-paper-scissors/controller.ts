import { Response } from 'express';
import { asyncHandler } from '../../../../middleware/errorHandler';
import { AuthenticatedRequest, requireUserId } from '../../../../middleware/auth';
import * as rpsService from './service';
import { CreateRpsRoundInput, RpsChooseInput } from './schemas';

export const createRound = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = requireUserId(req);
  const input = req.body as CreateRpsRoundInput;
  const round = await rpsService.createRound(userId, input.amount, input.currency, input.clientSeed);
  res.status(201).json({ success: true, data: round });
});

export const choose = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = requireUserId(req);
  const input = req.body as RpsChooseInput;
  const round = await rpsService.choose(req.params.roundId, userId, input.choice);
  res.json({ success: true, data: round });
});

export const getRound = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = requireUserId(req);
  const round = rpsService.getRound(req.params.roundId, userId);
  res.json({ success: true, data: round });
});

export const getStreak = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = requireUserId(req);
  const streak = await rpsService.getStreakForUser(userId);
  res.json({ success: true, data: streak });
});
