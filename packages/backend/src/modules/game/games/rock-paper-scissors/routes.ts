import { Router } from 'express';
import { validate, validateParams } from '../../../../middleware/validation';
import { wagerRateLimit } from '../../../../middleware/rateLimit';
import * as controller from './controller';
import { createRpsRoundSchema, rpsChooseSchema, roundIdParamsSchema } from './schemas';

const router = Router();

router.get('/streak', controller.getStreak);
router.post('/rounds', wagerRateLimit, validate(createRpsRoundSchema), controller.createRound);
router.get('/rounds/:roundId', validateParams(roundIdParamsSchema), controller.getRound);
router.post('/rounds/:roundId/choose', wagerRateLimit, validateParams(roundIdParamsSchema), validate(rpsChooseSchema), controller.choose);

export default router;
