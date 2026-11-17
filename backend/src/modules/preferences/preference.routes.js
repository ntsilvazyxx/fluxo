import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { createPreferenceController } from './preference.controller.js';
import { createPreferenceService } from './preference.service.js';
import {
  deleteKanbanColorSchema,
  listKanbanColorsSchema,
  updateKanbanColorSchema,
} from './preference.schemas.js';

export const createPreferenceRouter = (dependencies) => {
  const router = Router();
  const controller = createPreferenceController({
    service: createPreferenceService(dependencies),
  });

  router.use(authenticate(dependencies));

  router.get(
    '/kanban-colors',
    validate(listKanbanColorsSchema),
    asyncHandler(controller.listKanbanColors),
  );

  router.put(
    '/kanban-colors/:taskId',
    validate(updateKanbanColorSchema),
    asyncHandler(controller.updateKanbanColor),
  );

  router.delete(
    '/kanban-colors/:taskId',
    validate(deleteKanbanColorSchema),
    asyncHandler(controller.deleteKanbanColor),
  );

  return router;
};
