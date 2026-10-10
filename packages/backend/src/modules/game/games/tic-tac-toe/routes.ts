import { Router } from 'express';
import { validate, validateQuery, validateParams } from '../../../../middleware/validation';
import { wagerRateLimit } from '../../../../middleware/rateLimit';
import * as controller from './controller';
import { createTttRoomSchema, tttMoveSchema, roomIdParamsSchema, listTttRoomsQuerySchema } from './schemas';

const router = Router();

router.get('/', validateQuery(listTttRoomsQuerySchema), controller.listRooms);
router.post('/', wagerRateLimit, validate(createTttRoomSchema), controller.createRoom);
router.get('/:roomId', validateParams(roomIdParamsSchema), controller.getRoom);
router.post('/:roomId/join', wagerRateLimit, validateParams(roomIdParamsSchema), controller.joinRoom);
router.post('/:roomId/move', wagerRateLimit, validateParams(roomIdParamsSchema), validate(tttMoveSchema), controller.move);
router.post('/:roomId/resign', validateParams(roomIdParamsSchema), controller.resign);
router.post('/:roomId/cancel', validateParams(roomIdParamsSchema), controller.cancel);

export default router;
