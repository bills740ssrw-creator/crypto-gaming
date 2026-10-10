import { Router } from 'express';
import tttRoutes from './tic-tac-toe/routes';
import rpsRoutes from './rock-paper-scissors/routes';
import pathRoutes from './path-elimination/routes';

const router = Router();

router.use('/ttt', tttRoutes);
router.use('/rps', rpsRoutes);
router.use('/path', pathRoutes);

export default router;
