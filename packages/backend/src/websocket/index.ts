import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import { jwtService } from '../services/jwt';
import { JWTPayload } from '@crypto-gaming/shared';
import { logger } from '../services/logger';
import { noteUserConnected, noteUserDisconnected } from './disconnect-grace';

interface AuthenticatedSocket extends Socket {
  user?: JWTPayload;
  userId?: string;
}

const userSockets = new Map<string, Set<string>>();

export function addUserSocket(userId: string, socketId: string): number {
  let sockets = userSockets.get(userId);
  if (!sockets) {
    sockets = new Set<string>();
    userSockets.set(userId, sockets);
  }
  sockets.add(socketId);
  return sockets.size;
}

export function removeUserSocket(userId: string, socketId: string): number {
  const sockets = userSockets.get(userId);
  if (!sockets) return 0;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    userSockets.delete(userId);
    return 0;
  }
  return sockets.size;
}

export function initializeWebSocket(httpServer: HTTPServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 60000,
  });

  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = jwtService.verifyAccessToken(token);
      
      if (!payload) {
        return next(new Error('Invalid token'));
      }

      socket.user = payload;
      socket.userId = payload.userId;
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;

    addUserSocket(userId, socket.id);
    // emitToUser targets this room, so every socket must be in it.
    socket.join(`user:${userId}`);
    noteUserConnected(userId);

    logger.info('WebSocket connected', { userId, socketId: socket.id });

    socket.on('join:game', (data: { gameId: string; sessionId: string }) => {
      socket.join(`game:${data.gameId}:${data.sessionId}`);
      logger.debug('User joined game room', { userId, gameId: data.gameId, sessionId: data.sessionId });
    });

    socket.on('leave:game', (data: { gameId: string; sessionId: string }) => {
      socket.leave(`game:${data.gameId}:${data.sessionId}`);
      logger.debug('User left game room', { userId, gameId: data.gameId, sessionId: data.sessionId });
    });

    socket.on('subscribe:balance', () => {
      socket.join(`balance:${userId}`);
      logger.debug('User subscribed to balance updates', { userId });
    });

    socket.on('unsubscribe:balance', () => {
      socket.leave(`balance:${userId}`);
      logger.debug('User unsubscribed from balance updates', { userId });
    });

    socket.on('subscribe:transactions', () => {
      socket.join(`transactions:${userId}`);
      logger.debug('User subscribed to transaction updates', { userId });
    });

    socket.on('unsubscribe:transactions', () => {
      socket.leave(`transactions:${userId}`);
      logger.debug('User unsubscribed from transaction updates', { userId });
    });

    socket.on('ping', (callback) => {
      if (callback) callback({ timestamp: Date.now() });
    });

    socket.on('disconnect', (reason) => {
      const remaining = removeUserSocket(userId, socket.id);
      noteUserDisconnected(userId, remaining);
      logger.info('WebSocket disconnected', { userId, socketId: socket.id, reason, remaining });
    });

    socket.on('error', (error) => {
      logger.error('WebSocket error', { userId, socketId: socket.id, error: error.message });
    });
  });

  return io;
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  const io = getIO();
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
}

export function emitBalanceUpdate(userId: string, balance: { goldCoins?: string; sweepsCoins?: string; cryptoBalances?: Record<string, string> }): void {
  const io = getIO();
  if (io) {
    io.to(`balance:${userId}`).emit('balance:update', {
      type: 'BALANCE_UPDATE',
      payload: balance,
      timestamp: Date.now(),
    });
  }
}

export function emitTransactionUpdate(userId: string, transaction: unknown): void {
  const io = getIO();
  if (io) {
    io.to(`transactions:${userId}`).emit('transaction:update', {
      type: 'TRANSACTION_UPDATE',
      payload: transaction,
      timestamp: Date.now(),
    });
  }
}

export function emitGameUpdate(sessionId: string, gameId: string, data: {
  result: Record<string, unknown>;
  winAmount: string;
  newBalance: string;
  currency: string;
}): void {
  const io = getIO();
  if (io) {
    io.to(`game:${gameId}:${sessionId}`).emit('game:update', {
      type: 'GAME_UPDATE',
      payload: { sessionId, gameId, ...data },
      timestamp: Date.now(),
    });
  }
}

export function emitGameResult(sessionId: string, gameId: string, data: {
  result: Record<string, unknown>;
  winAmount: string;
  currency: string;
}): void {
  const io = getIO();
  if (io) {
    io.to(`game:${gameId}:${sessionId}`).emit('game:result', {
      type: 'GAME_RESULT',
      payload: { sessionId, gameId, ...data },
      timestamp: Date.now(),
    });
  }
}

export function broadcastToGame(gameId: string, sessionId: string, event: string, data: unknown): void {
  const io = getIO();
  if (io) {
    io.to(`game:${gameId}:${sessionId}`).emit(event, data);
  }
}

export function broadcastToAll(event: string, data: unknown): void {
  const io = getIO();
  if (io) {
    io.emit(event, data);
  }
}

export function getConnectedUsersCount(): number {
  return userSockets.size;
}

export function getUserSocketCount(userId: string): number {
  return userSockets.get(userId)?.size || 0;
}

export function isUserOnline(userId: string): boolean {
  return userSockets.has(userId);
}

let ioInstance: Server | null = null;

function getIO(): Server | null {
  return ioInstance;
}

export function setIOInstance(io: Server): void {
  ioInstance = io;
}

export function getIOInstance(): Server | null {
  return ioInstance;
}