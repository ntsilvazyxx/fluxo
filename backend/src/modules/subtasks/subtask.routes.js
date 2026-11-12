import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRoles } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { createSubtaskController } from './subtask.controller.js';
import { createSubtaskService } from './subtask.service.js';
import { createSubtaskSchema, listSubtasksSchema } from './subtask.schemas.js';

export const createSubtaskRouter = ({ prisma, config }) => {
  const router = Router();
  const controller = createSubtaskController({ service: createSubtaskService({ prisma }) });
  router.use(authenticate({ prisma, config }));
  router.get('/:id/subtasks', validate(listSubtasksSchema), asyncHandler(controller.list));
  router.post(
    '/:id/subtasks',
    requireRoles('ADMIN_MASTER', 'SECRETARY', 'MANAGER'),
    validate(createSubtaskSchema),
    asyncHandler(controller.create),
  );
  return router;
};
