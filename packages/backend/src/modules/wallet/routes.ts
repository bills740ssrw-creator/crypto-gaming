import { Router } from 'express';
import { validate, validateQuery } from '../../middleware/validation';
import { authenticate } from '../../middleware/auth';
import { apiRateLimit } from '../../middleware/rateLimit';
import * as walletController from './controller';
import { createWalletSchema, depositSchema, withdrawalSchema, transferSchema, getBalanceSchema } from './schemas';

const router = Router();

router.use(authenticate);
router.use(apiRateLimit);

router.get('/', walletController.getWallets);
router.post('/', validate(createWalletSchema), walletController.createWallet);
router.get('/balance', validateQuery(getBalanceSchema), walletController.getBalance);
router.get('/:currency', walletController.getWallet);
router.post('/deposit', validate(depositSchema), walletController.requestDeposit);
router.post('/withdraw', validate(withdrawalSchema), walletController.requestWithdrawal);
router.post('/transfer', validate(transferSchema), walletController.transfer);
router.get('/history', walletController.getTransactionHistory);

export default router;