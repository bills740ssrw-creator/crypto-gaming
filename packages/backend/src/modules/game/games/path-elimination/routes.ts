import { Router } from 'express';
import { validate, validateParams } from '../../../../middleware/validation';
import { wagerRateLimit } from '../../../../middleware/rateLimit';
import * as controller from './controller';
import { createPathRoundSchema, roundIdParamsSchema } from './schemas';

const router = Router();

router.post('/rounds', wagerRateLimit, validate(createPathRoundSchema), controller.createRound);
router.get('/rounds/:roundId', validateParams(roundIdParamsSchema), controller.getRound);
router.post('/rounds/:roundId/advance', wagerRateLimit, validateParams(roundIdParamsSchema), controller.advance);
router.post('/rounds/:roundId/cashout', wagerRateLimit, validateParams(roundIdParamsSchema), controller.cashout);
router.post('/rounds/:roundId/cancel', validateParams(roundIdParamsSchema), controller.cancel);

export default router;
