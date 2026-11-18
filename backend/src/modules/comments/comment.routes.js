import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { createCommentController } from './comment.controller.js';
import { createCommentService } from './comment.service.js';
import { createCommentSchema, listCommentsSchema } from './comment.schemas.js';

export const createTaskCommentRouter = ({ prisma, config }) => {
  const router = Router();
  const service = createCommentService({ prisma });
  const controller = createCommentController({ service });

  router.use(authenticate({ prisma, config }));

  router.get(
    '/:id/comments',
    validate(listCommentsSchema),
    asyncHandler(controller.list),
  );

  router.post(
    '/:id/comments',
    validate(createCommentSchema),
    asyncHandler(controller.create),
  );

  return router;
};

