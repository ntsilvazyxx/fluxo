import { Router } from 'express';

import { authenticate } from '../../middlewares/authenticate.js';
import { requireRoles } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { createDashboardController } from './dashboard.controller.js';
import { createDashboardService } from './dashboard.service.js';
import { dashboardSchema, reportSchema } from './dashboard.schemas.js';

const createController = (dependencies) => createDashboardController({ service: createDashboardService(dependencies) });
const secure = (router, dependencies) => {
  router.use(authenticate(dependencies));
  // ADMIN MASTER and TECHNICIAN intentionally have no managerial analytics access.
  router.use(requireRoles('SECRETARY', 'MANAGER'));
};

export const createDashboardRouter = (dependencies) => {
  const router = Router();
  secure(router, dependencies);
  const controller = createController(dependencies);
  router.get('/', validate(dashboardSchema), asyncHandler(controller.summary));
  return router;
};

export const createReportRouter = (dependencies) => {
  const router = Router();
  secure(router, dependencies);
  const controller = createController(dependencies);
  router.get('/', validate(reportSchema), asyncHandler(controller.report));
  return router;
};
