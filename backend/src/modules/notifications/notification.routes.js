import { Router } from 'express';

import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { createNotificationController } from './notification.controller.js';
import { createNotificationService } from './notification.service.js';
import {
  listNotificationsSchema,
  markReadSchema,
  markReadAllSchema,
} from './notification.schemas.js';

const build = ({ prisma }) =>
  createNotificationController({ service: createNotificationService({ prisma }) });

export const createNotificationRouter = (dependencies) => {
  const router = Router();
  const controller = build(dependencies);
  router.use(authenticate(dependencies));
  router.get(
    '/',
    validate(listNotificationsSchema),
    asyncHandler(controller.list),
  );
  router.patch(
    '/:id/read',
    validate(markReadSchema),
    asyncHandler(controller.markRead),
  );
  router.patch(
    '/read-all',
    validate(markReadAllSchema),
    asyncHandler(controller.markReadAll),
  );
  return router;
};
