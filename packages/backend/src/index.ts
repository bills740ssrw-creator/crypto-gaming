import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { logger } from './services/logger';
import { connectRedis, disconnectRedis, redis } from './services/redis';
import prisma from './services/prisma';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { initializeWebSocket, setIOInstance } from './websocket';
import authRoutes from './modules/auth/routes';
import walletRoutes from './modules/wallet/routes';
import gameRoutes from './modules/game/routes';
import userRoutes from './modules/user/routes';
import { gameService } from './modules/game/service';
import { blockchainIndexer } from './services/blockchainIndexer';
import { payoutEngine } from './services/payoutEngine';

const app = express();
const httpServer = createServer(app);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials,
}));
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) },
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

app.get('/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    try {
      await redis.ping();
    } catch {
      logger.warn('Redis ping failed during readiness check');
    }
    res.json({ success: true, data: { status: 'ready', timestamp: new Date().toISOString() } });
  } catch (error) {
    res.status(503).json({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Service not ready' } });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/admin/users', userRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const io = initializeWebSocket(httpServer);
setIOInstance(io);

async function startServer() {
  try {
    await prisma.$connect();
    logger.info('Database connected');

    try {
      await connectRedis();
      logger.info('Redis connected');
    } catch (error) {
      logger.warn('Redis unavailable, falling back to in-memory stores', {
        error: (error as Error).message,
      });
    }

    await gameService.initializeDefaultGames();
    logger.info('Default games initialized');

    blockchainIndexer.start();
    payoutEngine.start();

    httpServer.listen(config.port, config.host, () => {
      logger.info(`Server started on ${config.host}:${config.port}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: (error as Error).message });
    process.exit(1);
  }
}

async function shutdown() {
  logger.info('Shutting down...');

  blockchainIndexer.stop();
  payoutEngine.stop();

  httpServer.close(async () => {
    try {
      await disconnectRedis();
    } catch {
      logger.warn('Redis disconnect failed during shutdown');
    }
    await prisma.$disconnect();
    logger.info('Server shut down complete');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startServer();

export { app, httpServer, io };