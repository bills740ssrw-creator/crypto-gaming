import { Response } from 'express';
import { asyncHandler } from '../../../../middleware/errorHandler';
import { AuthenticatedRequest, requireUserId } from '../../../../middleware/auth';
import * as pathService from './service';
import { CreatePathRoundInput } from './schemas';

export const createRound = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = requireUserId(req);
  const input = req.body as CreatePathRoundInput;
  const round = await pathService.createRound(userId, input.amount, input.currency, input.clientSeed);
  res.status(201).json({ success: true, data: round });
});

export const advance = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = requireUserId(req);
  const round = await pathService.advance(req.params.roundId, userId);
  res.json({ success: true, data: round });
});

export const cashout = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = requireUserId(req);
  const round = await pathService.cashout(req.params.roundId, userId);
  res.json({ success: true, data: round });
});

export const cancel = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = requireUserId(req);
  const round = await pathService.cancel(req.params.roundId, userId);
  res.json({ success: true, data: round });
});

export const getRound = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = requireUserId(req);
  const round = pathService.getRound(req.params.roundId, userId);
  res.json({ success: true, data: round });
});
