import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRoles } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { createUserService } from './user.service.js';
import { createUserSchema, listUsersSchema, updateUserSchema, userIdSchema } from './user.schemas.js';

export const createUserRouter = ({ prisma, config }) => {
  const router = Router(); const service = createUserService({ prisma });
  router.use(authenticate({ prisma, config }));
  router.get('/', validate(listUsersSchema), asyncHandler(async (req, res) => res.json({ data: { users: await service.list(req.auth, req.validated.query.q) } })));
  router.get('/:id', validate(userIdSchema), asyncHandler(async (req, res) => res.json({ data: { user: await service.get(req.auth, req.validated.params.id) } })));
  router.post('/', requireRoles('ADMIN_MASTER', 'SECRETARY'), validate(createUserSchema), asyncHandler(async (req, res) => res.status(201).json({ data: { user: await service.create(req, req.validated.body) } })));
  router.patch('/:id', requireRoles('ADMIN_MASTER'), validate(updateUserSchema), asyncHandler(async (req, res) => res.json({ data: { user: await service.update(req, req.validated.params.id, req.validated.body) } })));
  return router;
};
