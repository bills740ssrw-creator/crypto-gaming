import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler';
import { gameService } from './service';
import { AuthenticatedRequest } from '../../middleware/auth';

export const getGames = asyncHandler(async (req: Request, res: Response) => {
  const result = await gameService.getGames(req.query as any);
  res.json({ success: true, data: result });
});

export const getGame = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const game = await gameService.getGame(id);
  if (!game) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Game not found' } });
    return;
  }
  res.json({ success: true, data: game });
});

export const createGame = asyncHandler(async (req: Request, res: Response) => {
  const game = await gameService.createGame(req.body);
  res.status(201).json({ success: true, data: game });
});

export const updateGame = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const game = await gameService.updateGame(id, req.body);
  res.json({ success: true, data: game });
});

export const deleteGame = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  await gameService.deleteGame(id);
  res.json({ success: true, message: 'Game deleted successfully' });
});

export const startGameSession = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const session = await gameService.startGameSession(req.userId!, req.body);
  res.status(201).json({ success: true, data: session });
});

export const placeBet = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await gameService.placeBet(req.userId!, req.body);
  res.json({ success: true, data: result });
});

export const processGameResult = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId } = req.params;
  const { result, winAmount, seed, clientSeed } = req.body;
  const gameResult = await gameService.processGameResult(sessionId, result, winAmount, seed, clientSeed);
  res.json({ success: true, data: gameResult });
});

export const endGameSession = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId } = req.params;
  const session = await gameService.endGameSession(req.userId!, sessionId);
  res.json({ success: true, data: session });
});

export const getGameHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await gameService.getGameHistory(req.userId!, req.query as any);
  res.json({ success: true, data: result });
});

export const getActiveSession = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { gameId } = req.params;
  const session = await gameService.getActiveSession(req.userId!, gameId);
  res.json({ success: true, data: session });
});

export const getSession = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId } = req.params;
  const session = await gameService.getSession(sessionId);
  if (!session) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
    return;
  }
  if (session.userId !== req.userId) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Unauthorized' } });
    return;
  }
  res.json({ success: true, data: session });
});

export const getSessionStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { gameId } = req.query;
  const stats = await gameService.getSessionStats(req.userId!, gameId as string);
  res.json({ success: true, data: stats });
});