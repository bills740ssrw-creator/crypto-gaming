import { Router } from 'express';
import { validate, validateQuery } from '../../middleware/validation';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { apiRateLimit, wagerRateLimit } from '../../middleware/rateLimit';
import * as gameController from './controller';
import { createGameSchema, startGameSessionSchema, placeBetSchema, endGameSessionSchema, getGameHistorySchema, getGamesSchema } from './schemas';
import gamesRoutes from './games/routes';

const router = Router();

router.get('/', validateQuery(getGamesSchema), gameController.getGames);
router.post('/', authenticate, requireAdmin, validate(createGameSchema), gameController.createGame);
router.patch('/:id', authenticate, requireAdmin, gameController.updateGame);
router.delete('/:id', authenticate, requireAdmin, gameController.deleteGame);

router.use(authenticate);
router.use(apiRateLimit);

router.use(gamesRoutes);

router.post('/sessions', validate(startGameSessionSchema), gameController.startGameSession);
router.get('/sessions/active/:gameId', gameController.getActiveSession);
router.get('/sessions/:sessionId', gameController.getSession);
router.post('/sessions/:sessionId/bet', wagerRateLimit, validate(placeBetSchema), gameController.placeBet);
router.post('/sessions/:sessionId/result', gameController.processGameResult);
router.post('/sessions/:sessionId/end', validate(endGameSessionSchema), gameController.endGameSession);
router.get('/history', validateQuery(getGameHistorySchema), gameController.getGameHistory);
router.get('/stats', gameController.getSessionStats);
router.get('/:id', gameController.getGame);

export default router;
