import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { createAuthController } from './auth.controller.js';
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from './auth.schemas.js';
import { createAuthService } from './auth.service.js';

export const createAuthRouter = ({ prisma, config, passwordResetNotifier }) => {
  const router = Router();
  const service = createAuthService({ prisma, config, passwordResetNotifier });
  const controller = createAuthController({ service, config });
  const loginLimiter = rateLimit({
    windowMs: config.loginWindowMinutes * 60_000,
    limit: config.loginMaxAttempts,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: {
        code: 'TOO_MANY_LOGIN_ATTEMPTS',
        message: 'Muitas tentativas. Aguarde antes de tentar novamente.',
      },
    },
  });

  router.post('/login', loginLimiter, validate(loginSchema), asyncHandler(controller.login));
  router.post('/refresh', asyncHandler(controller.refresh));
  router.post('/logout', asyncHandler(controller.logout));
  router.get('/me', asyncHandler(authenticate({ prisma, config })), controller.me);
  router.post(
    '/password/forgot',
    loginLimiter,
    validate(forgotPasswordSchema),
    asyncHandler(controller.forgotPassword),
  );
  router.post(
    '/password/reset',
    loginLimiter,
    validate(resetPasswordSchema),
    asyncHandler(controller.resetPassword),
  );

  return router;
};
