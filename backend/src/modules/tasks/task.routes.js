import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { requireRoles } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { createTaskController } from './task.controller.js';
import { createTaskService } from './task.service.js';
import { assignTaskSchema, assignmentActionSchema, cancelTaskSchema, completeTaskSchema, createTaskSchema, listTasksSchema, rejectAssignmentSchema, restartTaskSchema, taskIdSchema, updateTaskSchema } from './task.schemas.js';

const authenticated = (router, prisma, config) => router.use(authenticate({ prisma, config }));
export const createTaskRouter = ({ prisma, config }) => {
  const router=Router(),controller=createTaskController({service:createTaskService({prisma})});authenticated(router,prisma,config);
  router.get('/',validate(listTasksSchema),asyncHandler(controller.list));
  router.post('/',requireRoles('ADMIN_MASTER','SECRETARY','MANAGER'),validate(createTaskSchema),asyncHandler(controller.create));
  router.get('/:id',validate(taskIdSchema),asyncHandler(controller.detail));
  router.patch('/:id',requireRoles('ADMIN_MASTER','SECRETARY','MANAGER'),validate(updateTaskSchema),asyncHandler(controller.update));
  router.post('/:id/assignments',requireRoles('ADMIN_MASTER','SECRETARY','MANAGER'),validate(assignTaskSchema),asyncHandler(controller.assign));
  router.post('/:id/complete',validate(completeTaskSchema),asyncHandler(controller.complete));
  router.post('/:id/cancel',requireRoles('ADMIN_MASTER','SECRETARY','MANAGER'),validate(cancelTaskSchema),asyncHandler(controller.cancel));
  router.post('/:id/reopen',requireRoles('ADMIN_MASTER','SECRETARY','MANAGER'),validate(restartTaskSchema),asyncHandler(controller.reopen));
  router.post('/:id/restore',requireRoles('ADMIN_MASTER','SECRETARY','MANAGER'),validate(restartTaskSchema),asyncHandler(controller.restore));
  return router;
};
export const createAssignmentRouter = ({prisma,config})=>{const router=Router(),controller=createTaskController({service:createTaskService({prisma})});authenticated(router,prisma,config);router.post('/:id/accept',validate(assignmentActionSchema),asyncHandler(controller.accept));router.post('/:id/reject',validate(rejectAssignmentSchema),asyncHandler(controller.reject));return router;};
export const createTaskQueryRouters = ({prisma,config})=>{const controller=createTaskController({service:createTaskService({prisma})});const make=(method)=>{const router=Router();authenticated(router,prisma,config);router.get('/',validate(listTasksSchema),...(method==='kanban'?[requireRoles('ADMIN_MASTER','SECRETARY','MANAGER')]:[]),asyncHandler(controller[method]));return router;};return {kanban:make('kanban'),history:make('history'),mine:make('mine')};};
