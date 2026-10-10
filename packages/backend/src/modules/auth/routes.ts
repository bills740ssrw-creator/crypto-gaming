import { Router } from 'express';
import { validate } from '../../middleware/validation';
import { authenticate } from '../../middleware/auth';
import { authRateLimit } from '../../middleware/rateLimit';
import * as authController from './controller';
import { registerSchema, loginSchema, refreshTokenSchema, changePasswordSchema, updateProfileSchema, kycSchema } from './schemas';

const router = Router();

router.post('/register', authRateLimit, validate(registerSchema), authController.register);
router.post('/login', authRateLimit, validate(loginSchema), authController.login);
router.post('/refresh', validate(refreshTokenSchema), authController.refresh);
router.post('/logout', authenticate, authController.logout);
router.post('/change-password', authenticate, validate(changePasswordSchema), authController.changePassword);
router.patch('/profile', authenticate, validate(updateProfileSchema), authController.updateProfile);
router.get('/profile', authenticate, authController.getProfile);
router.post('/kyc', authenticate, validate(kycSchema), authController.submitKYC);
router.delete('/account', authenticate, authController.deleteAccount);

export default router;