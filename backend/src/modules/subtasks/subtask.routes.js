import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRoles } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../shared/errors/app-error.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { createSubtaskController } from './subtask.controller.js';
import { createSubtaskService } from './subtask.service.js';
import { listSubtasksSchema } from './subtask.schemas.js';

export const createSubtaskRouter = ({ prisma, config }) => {
  const router = Router();
  const controller = createSubtaskController({ service: createSubtaskService({ prisma }) });
  router.use(authenticate({ prisma, config }));
  // Read-only compatibility: historical subtasks remain visible in task details
  // and reports. Creation is retired and refused explicitly.
  router.get('/:id/subtasks', validate(listSubtasksSchema), asyncHandler(controller.list));
  router.post(
    '/:id/subtasks',
    requireRoles('ADMIN_MASTER', 'SECRETARY', 'MANAGER'),
    (_request, _response, next) => next(new AppError(410, 'SUBTASK_CREATION_RETIRED', 'A criação de subtarefas foi descontinuada. Os registros históricos permanecem disponíveis para consulta.')),
  );
  return router;
};
