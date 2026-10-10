import { Request, Response } from 'express';
import { CurrencyType } from '@crypto-gaming/shared';
import { asyncHandler, NotFoundError } from '../../../../middleware/errorHandler';
import { AuthenticatedRequest, requireUserId } from '../../../../middleware/auth';
import * as tttService from './service';
import { CreateTttRoomInput, TttMoveInput, ListTttRoomsQuery } from './schemas';

export const listRooms = asyncHandler(async (req: Request, res: Response) => {
  const { currency } = req.query as Partial<ListTttRoomsQuery>;
  const rooms = tttService.listOpenRooms(currency as CurrencyType | undefined);
  res.json({ success: true, data: { rooms, total: rooms.length } });
});

export const getRoom = asyncHandler(async (req: Request, res: Response) => {
  const room = tttService.getRoom(req.params.roomId);
  if (!room) {
    throw new NotFoundError('Game room');
  }
  res.json({ success: true, data: room });
});

export const createRoom = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = requireUserId(req);
  const input = req.body as CreateTttRoomInput;
  const room = await tttService.createRoom(userId, input.stake, input.currency);
  res.status(201).json({ success: true, data: room });
});

export const joinRoom = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = requireUserId(req);
  const room = await tttService.joinRoom(req.params.roomId, userId);
  res.json({ success: true, data: room });
});

export const move = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = requireUserId(req);
  const input = req.body as TttMoveInput;
  const room = await tttService.move(req.params.roomId, userId, input.cell);
  res.json({ success: true, data: room });
});

export const resign = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = requireUserId(req);
  const room = await tttService.resign(req.params.roomId, userId);
  res.json({ success: true, data: room });
});

export const cancel = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = requireUserId(req);
  const result = await tttService.cancel(req.params.roomId, userId);
  res.json({ success: true, data: result });
});
