import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRoles } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { createTeamService } from './team.service.js';
import { createTeamSchema, teamIdSchema, teamUserSchema } from './team.schemas.js';

export const createTeamRouter = ({ prisma, config }) => {
  const router = Router(); const service = createTeamService({ prisma }); const edit = requireRoles('ADMIN_MASTER', 'SECRETARY');
  router.use(authenticate({ prisma, config }));
  router.get('/', asyncHandler(async (req, res) => res.json({ data: { teams: await service.list(req.auth) } })));
  router.get('/:id', validate(teamIdSchema), asyncHandler(async (req, res) => res.json({ data: { team: await service.get(req.auth, req.validated.params.id) } })));
  router.post('/', edit, validate(createTeamSchema), asyncHandler(async (req, res) => res.status(201).json({ data: { team: await service.create(req, req.validated.body) } })));
  for (const [path, kind] of [['members', 'member'], ['managers', 'manager']]) {
    router.post(`/:id/${path}/:userId`, edit, validate(teamUserSchema), asyncHandler(async (req, res) => res.status(201).json({ data: { link: await service.addLink(req, req.validated.params.id, req.validated.params.userId, kind) } })));
    router.delete(`/:id/${path}/:userId`, edit, validate(teamUserSchema), asyncHandler(async (req, res) => { await service.removeLink(req, req.validated.params.id, req.validated.params.userId, kind); res.status(204).send(); }));
  }
  return router;
};
