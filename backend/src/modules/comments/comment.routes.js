import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { AppError } from '../../shared/errors/app-error.js';
import { createCommentController } from './comment.controller.js';
import { createCommentService } from './comment.service.js';
import { listCommentsSchema } from './comment.schemas.js';

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
    (_request, _response, next) => next(new AppError(410, 'COMMENT_CREATION_RETIRED', 'A criação de comentários legados foi descontinuada. O módulo de Chat é o canal exclusivo de comunicação entre os participantes.')),
  );

  return router;
};

