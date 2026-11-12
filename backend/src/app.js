import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { createPrismaClient } from './infrastructure/database/prisma.js';
import { correlationId } from './middlewares/correlation-id.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { createApiRouter } from './routes/index.js';
import { createOutboxWorker } from './modules/outbox/outbox.worker.js';
import { createEmailSender } from './modules/outbox/outbox.sender.js';
import { AppError } from './shared/errors/app-error.js';

export const createApp = ({
  prisma = createPrismaClient(),
  config = env,
  passwordResetNotifier,
  imageStorage,
  startOutboxWorker = false,
} = {}) => {
  config = { ...env, ...config };
  const app = express();
  const emailSender = createEmailSender({ config });

  app.disable('x-powered-by');
  app.use(correlationId);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Origem não permitida pelo CORS.'));
      },
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1', createApiRouter({ prisma, config, passwordResetNotifier, imageStorage }));
  app.use(notFound);
  app.use(errorHandler);

  if (startOutboxWorker) {
    const outboxWorker = createOutboxWorker({ prisma, emailSender, config });
    app.locals.outboxWorker = outboxWorker;
    void outboxWorker.start();
  }

  return app;
};
