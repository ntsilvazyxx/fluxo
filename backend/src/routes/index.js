import { Router } from 'express';

import { healthRouter } from '../modules/health/health.routes.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { createTeamRouter } from '../modules/teams/team.routes.js';
import { createUserRouter } from '../modules/users/user.routes.js';
import { createAssignmentRouter, createTaskQueryRouters, createTaskRouter } from '../modules/tasks/task.routes.js';

export const createApiRouter = (dependencies) => {
  const apiRouter = Router();

apiRouter.get('/', (_request, response) => {
  response.status(200).json({
    data: {
      name: 'SEAF — API de Gestão de Tarefas',
      version: 'v1',
    },
  });
});

apiRouter.use('/health', healthRouter);
  apiRouter.use('/auth', createAuthRouter(dependencies));
  apiRouter.use('/users', createUserRouter(dependencies));
  apiRouter.use('/teams', createTeamRouter(dependencies));
  apiRouter.use('/tasks', createTaskRouter(dependencies));
  apiRouter.use('/assignments', createAssignmentRouter(dependencies));
  const taskQueries = createTaskQueryRouters(dependencies);
  apiRouter.use('/kanban', taskQueries.kanban);
  apiRouter.use('/my-tasks', taskQueries.mine);
  apiRouter.use('/task-history', taskQueries.history);
  return apiRouter;
};
