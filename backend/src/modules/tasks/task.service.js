import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { lockTaskAggregate, runCriticalTransaction } from '../../infrastructure/database/transaction.js';
import { AppError } from '../../shared/errors/app-error.js';
import { executeIdempotent } from '../../shared/http/idempotency.js';
import { ACTIVE_STATUSES, requireExpectedVersion, TERMINAL_STATUSES, transitionTo } from './task.policy.js';
import { presentTask } from './task.presenter.js';

const missing = () => new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada.');
const conflict = (code, message) => new AppError(409, code, message);
const scopeWhere = (actor) => {
  if (['ADMIN_MASTER','SECRETARY'].includes(actor.roleCode)) return {};
  if (actor.roleCode === 'MANAGER') return { team: { managers: { some: { userId: actor.userId, endedAt: null } } } };
  return { currentCycle: { assignments: { some: { userId: actor.userId, OR: [{ endedAt: null }, { endReason: 'COMPLETED' }] } } } };
};
const includeCurrent = { team: true, currentCycle: { include: { assignments: { include: { user: true }, orderBy: { assignedAt: 'desc' } } } } };
const audit = (tx, request, data) => tx.auditEvent.create({ data: { id: randomUUID(), actorId: request.auth.userId, correlationId: request.correlationId, ...data } });
const outbox = (tx, taskId, cycle, type, payload = {}) => tx.outboxEvent.create({ data: { id: randomUUID(), eventType: type, payloadJson: { taskId, cycleId: cycle.id, ...payload }, dedupeKey: `task:${taskId}:${type}:${cycle.version + 1}` } });
const requireAdminReason = (request, reason) => { if (request.auth.roleCode === 'ADMIN_MASTER' && !reason) throw new AppError(422, 'ADMIN_REASON_REQUIRED', 'A intervenção do ADMIN MASTER exige justificativa.'); };

async function canManageTeam(client, actor, teamId) {
  if (['ADMIN_MASTER','SECRETARY'].includes(actor.roleCode)) return true;
  if (actor.roleCode !== 'MANAGER') return false;
  return Boolean(await client.teamManager.findFirst({ where: { teamId, userId: actor.userId, endedAt: null } }));
}
async function requireManagement(client, request, teamId, reason) {
  requireAdminReason(request, reason);
  if (!(await canManageTeam(client, request.auth, teamId))) throw missing();
}
async function lockCurrent(client, taskId) {
  const rows = await client.$queryRaw(Prisma.sql`SELECT id, teamId, currentCycleId FROM tasks WHERE id = ${taskId} AND deletedAt IS NULL FOR UPDATE`);
  const task = rows[0]; if (!task?.currentCycleId) throw missing();
  await lockTaskAggregate(client, { rootTaskId: task.id, cycleIds: [task.currentCycleId] });
  const cycle = await client.taskCycle.findUnique({ where: { id: task.currentCycleId }, include: { assignments: { where: { endedAt: null } }, requests: { where: { status: 'PENDING' } } } });
  if (!cycle || cycle.closedAt) throw conflict('TASK_CYCLE_CLOSED', 'O ciclo atual já foi encerrado.');
  const assignment = cycle.assignments[0] ?? null;
  if (assignment) await lockTaskAggregate(client, { assignmentIds: [assignment.id], requestIds: cycle.requests.map((item)=>item.id) });
  return { task, cycle, assignment };
}
async function lockForCancellation(client, taskId) {
  const rows = await client.$queryRaw(Prisma.sql`SELECT id, teamId, currentCycleId FROM tasks WHERE id = ${taskId} AND deletedAt IS NULL FOR UPDATE`);
  const task = rows[0];
  if (!task?.currentCycleId) throw missing();
  const childPointers = await client.task.findMany({ where: { parentCycleId: task.currentCycleId, currentCycle: { status: { in: ACTIVE_STATUSES } } }, select: { id: true, currentCycleId: true }, orderBy: { id: 'asc' } });
  const cycleIds = [task.currentCycleId, ...childPointers.map((child) => child.currentCycleId)];
  await lockTaskAggregate(client, { rootTaskId: task.id, subtaskIds: childPointers.map((child) => child.id), cycleIds });
  const cycles = await client.taskCycle.findMany({ where: { id: { in: cycleIds } }, include: { assignments: { where: { endedAt: null } }, requests: { where: { status: 'PENDING' } } } });
  const assignments = cycles.flatMap((cycle) => cycle.assignments);
  const requests = cycles.flatMap((cycle) => cycle.requests);
  await lockTaskAggregate(client, { assignmentIds: assignments.map((item) => item.id), requestIds: requests.map((item) => item.id) });
  const byId = new Map(cycles.map((cycle) => [cycle.id, cycle]));
  const cycle = byId.get(task.currentCycleId);
  if (!cycle || cycle.closedAt) throw conflict('TASK_CYCLE_CLOSED', 'O ciclo atual já foi encerrado.');
  return { root: { task, cycle, assignment: cycle.assignments[0] ?? null }, children: childPointers.map((child) => ({ ...child, currentCycle: byId.get(child.currentCycleId) })) };
}
async function closePendingRequests(tx, cycleId, status, actorId, now) {
  const pending = await tx.taskRequest.findMany({ where: { cycleId, status: 'PENDING' }, select: { id: true, assignmentId: true } });
  if (!pending.length) return;
  await tx.taskPauseInterval.updateMany({ where: { requestId: { in: pending.map((item)=>item.id) }, endedAt: null }, data: { endedAt: now } });
  await tx.taskRequest.updateMany({ where: { id: { in: pending.map((item)=>item.id) } }, data: { status, decidedAt: now, decidedById: actorId } });
}

export const createTaskService = ({ prisma }) => ({
  async list(actor, filters, mode = 'all') {
    const now = new Date(); const where = { deletedAt: null, ...scopeWhere(actor) };
    if (mode === 'kanban') where.currentCycle = { ...(where.currentCycle ?? {}), status: { in: ACTIVE_STATUSES } };
    if (mode === 'history') where.currentCycle = { ...(where.currentCycle ?? {}), status: { in: TERMINAL_STATUSES } };
    if (mode === 'mine') where.currentCycle = { assignments: { some: { userId: actor.userId, OR: [{ endedAt: null }, { endReason: 'COMPLETED' }] } } };
    if (filters.teamId) where.teamId = filters.teamId;
    const cycleFilter = { ...(where.currentCycle ?? {}) };
    if (filters.priority) cycleFilter.priority = filters.priority;
    if (filters.status) cycleFilter.status = filters.status;
    if (filters.responsibleId && mode !== 'mine') {
      if (actor.roleCode === 'TECHNICIAN' && filters.responsibleId !== actor.userId) where.id = '__outside_scope__';
      else cycleFilter.assignments = { some: { userId: filters.responsibleId } };
    }
    if (filters.deadlineFrom || filters.deadlineTo) cycleFilter.deadlineAt = { ...(filters.deadlineFrom ? { gte: filters.deadlineFrom } : {}), ...(filters.deadlineTo ? { lte: filters.deadlineTo } : {}) };
    if (filters.overdue === 'true') { cycleFilter.deadlineAt = { ...(cycleFilter.deadlineAt ?? {}), lt: now }; cycleFilter.status = { in: ACTIVE_STATUSES }; }
    if (filters.overdue === 'false') cycleFilter.OR = [{ deadlineAt: null }, { deadlineAt: { gte: now } }, { status: { in: TERMINAL_STATUSES } }];
    if (filters.search) {
      const numeric = /^\d+$/.test(filters.search) ? BigInt(filters.search) : null;
      where.OR = [{ currentCycle: { title: { contains: filters.search } } }, ...(numeric ? [{ publicNumber: numeric }] : [])];
    }
    if (Object.keys(cycleFilter).length) where.currentCycle = cycleFilter;
    const skip = (filters.page - 1) * filters.pageSize;
    const [total, tasks] = await Promise.all([prisma.task.count({ where }), prisma.task.findMany({ where, include: includeCurrent, orderBy: { updatedAt: 'desc' }, skip, take: filters.pageSize })]);
    return { tasks: tasks.map(presentTask), meta: { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.ceil(total / filters.pageSize) } };
  },

  async detail(actor, id) {
    const task = await prisma.task.findFirst({ where: { id, deletedAt: null, ...scopeWhere(actor) }, include: { team: true, currentCycle: { include: { assignments: { include: { user: true }, orderBy: { assignedAt: 'desc' } } } }, cycles: { include: { assignments: { include: { user: true }, orderBy: { assignedAt: 'asc' } }, deadlineChanges: { orderBy: { createdAt: 'asc' } }, notes: { orderBy: { createdAt: 'asc' } } }, orderBy: { cycleNumber: 'asc' } } } });
    if (!task) throw missing();
    const ids = [task.id, ...task.cycles.map((cycle)=>cycle.id), ...task.cycles.flatMap((cycle)=>cycle.assignments.map((item)=>item.id))];
    const events = await prisma.auditEvent.findMany({ where: { entityId: { in: ids } }, orderBy: { createdAt: 'asc' } });
    return { ...presentTask(task), cycles: task.cycles.map((cycle)=>({ id: cycle.id, cycleNumber: cycle.cycleNumber, title: cycle.title, description: cycle.description, priority: cycle.priority, status: cycle.status, deadlineAt: cycle.deadlineAt, version: cycle.version, openedAt: cycle.openedAt, closedAt: cycle.closedAt, completionText: cycle.completionText, assignments: cycle.assignments.map((a)=>({ id:a.id,userId:a.userId,user:{id:a.user.id,name:a.user.name},assignedAt:a.assignedAt,acceptedAt:a.acceptedAt,endedAt:a.endedAt,endReason:a.endReason })), deadlineChanges: cycle.deadlineChanges, notes: cycle.notes })), history: events };
  },

  async create(request, input, key) {
    requireAdminReason(request, input.reason);
    return executeIdempotent(prisma, { actorId: request.auth.userId, key, payload: input, status: 201, operation: async (tx) => {
      const team = await tx.team.findFirst({ where: { id: input.teamId, isActive: true } });
      if (!team || !(await canManageTeam(tx, request.auth, team.id))) throw new AppError(404, 'TEAM_NOT_FOUND', 'Equipe não encontrada.');
      const taskId=randomUUID(), cycleId=randomUUID(), now=new Date();
      await tx.task.create({ data: { id: taskId, teamId: team.id, createdById: request.auth.userId } });
      const cycle = await tx.taskCycle.create({ data: { id: cycleId, taskId, cycleNumber: 1, title: input.title, description: input.description, priority: input.priority, openedAt: now } });
      await tx.task.update({ where: { id: taskId }, data: { currentCycleId: cycleId } });
      await audit(tx, request, { entityType:'Task',entityId:taskId,action:'TASK_CREATED',afterJson:{teamId:team.id,cycleId,title:cycle.title,priority:cycle.priority},reason:input.reason });
      await outbox(tx, taskId, cycle, 'TASK_CREATED');
      return presentTask(await tx.task.findUnique({ where:{id:taskId},include:includeCurrent }));
    } });
  },

  async update(request, id, input) {
    return runCriticalTransaction(prisma, async (tx) => {
      const { task, cycle } = await lockCurrent(tx, id); await requireManagement(tx, request, task.teamId, input.reason); requireExpectedVersion(cycle,input.expectedVersion);
      const before={title:cycle.title,description:cycle.description,priority:cycle.priority,version:cycle.version};
      const result=await tx.taskCycle.updateMany({where:{id:cycle.id,version:input.expectedVersion,closedAt:null},data:{...(input.title?{title:input.title}:{}),...(input.description?{description:input.description}:{}),...(input.priority?{priority:input.priority}:{}),version:{increment:1}}});
      if(result.count!==1)throw conflict('TASK_VERSION_CONFLICT','A tarefa foi alterada por outra pessoa.');
      const updated=await tx.taskCycle.findUnique({where:{id:cycle.id}});
      await audit(tx,request,{entityType:'TaskCycle',entityId:cycle.id,action:'TASK_EDITED',beforeJson:before,afterJson:{title:updated.title,description:updated.description,priority:updated.priority,version:updated.version},reason:input.reason});
      await outbox(tx, id, cycle, 'TASK_EDITED');
      return presentTask(await tx.task.findUnique({where:{id},include:includeCurrent}));
    });
  },

  async assign(request, id, input, key) {
    return executeIdempotent(prisma,{actorId:request.auth.userId,key,payload:{id,...input},operation:async(tx)=>{
      const {task,cycle,assignment}=await lockCurrent(tx,id); await requireManagement(tx,request,task.teamId,input.reason); requireExpectedVersion(cycle,input.expectedVersion); transitionTo(cycle.status,'assign');
      if(assignment&&!input.reason)throw new AppError(422,'REASSIGNMENT_REASON_REQUIRED','A reatribuição exige justificativa.');
      if(input.deadlineAt<=new Date()&&!input.reason)throw new AppError(422,'PAST_DEADLINE_REASON_REQUIRED','Prazo vencido exige justificativa.');
      const user=await tx.user.findFirst({where:{id:input.userId,isActive:true,deletedAt:null},include:{role:true,memberships:{where:{teamId:task.teamId,leftAt:null}},managedTeams:{where:{teamId:task.teamId,endedAt:null}}}});
      const selfGlobal=user?.id===request.auth.userId&&['SECRETARY','ADMIN_MASTER'].includes(user?.role.code);
      if(!user||(!user.memberships.length&&!user.managedTeams.length&&!selfGlobal))throw new AppError(422,'ASSIGNEE_NOT_ELIGIBLE','O responsável não está ativo ou elegível para a equipe.');
      const calendar=await tx.workCalendar.findFirst({where:{teamId:task.teamId,activeVersionId:{not:null}}});
      if(!calendar?.activeVersionId)throw new AppError(422,'ACTIVE_CALENDAR_REQUIRED','A equipe precisa de uma versão ativa de calendário antes da atribuição.');
      const now=new Date();
      if(assignment){await closePendingRequests(tx,cycle.id,'CLOSED_BY_REASSIGNMENT',request.auth.userId,now);await tx.taskAssignment.update({where:{id:assignment.id},data:{endedAt:now,endReason:'REASSIGNED'}});}
      const created=await tx.taskAssignment.create({data:{id:randomUUID(),cycleId:cycle.id,userId:user.id,assignedById:request.auth.userId,calendarVersionId:calendar.activeVersionId,assignedAt:now}});
      if(!cycle.deadlineAt||cycle.deadlineAt.getTime()!==input.deadlineAt.getTime())await tx.deadlineChange.create({data:{id:randomUUID(),cycleId:cycle.id,oldDeadlineAt:cycle.deadlineAt,newDeadlineAt:input.deadlineAt,reason:input.reason??'Prazo definido na atribuição inicial.',changedById:request.auth.userId}});
      await tx.taskCycle.update({where:{id:cycle.id},data:{status:'AWAITING_ACCEPTANCE',deadlineAt:input.deadlineAt,version:{increment:1}}});
      await audit(tx,request,{entityType:'TaskAssignment',entityId:created.id,action:assignment?'TASK_REASSIGNED':'TASK_ASSIGNED',afterJson:{taskId:id,cycleId:cycle.id,userId:user.id,deadlineAt:input.deadlineAt},reason:input.reason});await outbox(tx,id,cycle,assignment?'TASK_REASSIGNED':'TASK_ASSIGNED',{userId:user.id});
      return presentTask(await tx.task.findUnique({where:{id},include:includeCurrent}));
    }});
  },

  async accept(request, assignmentId, input, key) {
    return executeIdempotent(prisma,{actorId:request.auth.userId,key,payload:{assignmentId,...input},operation:async(tx)=>{
      const initial=await tx.taskAssignment.findUnique({where:{id:assignmentId},include:{cycle:{include:{task:true}}}});if(!initial)throw new AppError(404,'ASSIGNMENT_NOT_FOUND','Atribuição não encontrada.');
      const {task,cycle,assignment}=await lockCurrent(tx,initial.cycle.taskId);requireExpectedVersion(cycle,input.expectedVersion);transitionTo(cycle.status,'accept');
      if(!assignment||assignment.id!==assignmentId||assignment.userId!==request.auth.userId)throw conflict('ASSIGNMENT_NOT_CURRENT','A atribuição não é mais atual ou não pertence a você.');
      const now=new Date();await tx.taskAssignment.update({where:{id:assignment.id},data:{acceptedAt:now}});await tx.taskCycle.update({where:{id:cycle.id},data:{status:'IN_PROGRESS',version:{increment:1}}});
      await audit(tx,request,{entityType:'TaskAssignment',entityId:assignment.id,action:'ASSIGNMENT_ACCEPTED',afterJson:{acceptedAt:now}});await outbox(tx,task.id,cycle,'ASSIGNMENT_ACCEPTED',{userId:request.auth.userId});return presentTask(await tx.task.findUnique({where:{id:task.id},include:includeCurrent}));
    }});
  },

  async reject(request, assignmentId, input, key) {
    return executeIdempotent(prisma,{actorId:request.auth.userId,key,payload:{assignmentId,...input},operation:async(tx)=>{
      const initial=await tx.taskAssignment.findUnique({where:{id:assignmentId},include:{cycle:{include:{task:true}}}});if(!initial)throw new AppError(404,'ASSIGNMENT_NOT_FOUND','Atribuição não encontrada.');
      const {task,cycle,assignment}=await lockCurrent(tx,initial.cycle.taskId);requireExpectedVersion(cycle,input.expectedVersion);transitionTo(cycle.status,'reject');
      if(!assignment||assignment.id!==assignmentId||assignment.userId!==request.auth.userId)throw conflict('ASSIGNMENT_NOT_CURRENT','A atribuição não é mais atual ou não pertence a você.');
      const now=new Date();await tx.taskAssignment.update({where:{id:assignment.id},data:{endedAt:now,endReason:'REJECTED'}});await tx.taskCycle.update({where:{id:cycle.id},data:{status:'PENDING',deadlineAt:null,version:{increment:1}}});
      await audit(tx,request,{entityType:'TaskAssignment',entityId:assignment.id,action:'ASSIGNMENT_REJECTED',beforeJson:{deadlineAt:cycle.deadlineAt},afterJson:{deadlineAt:null},reason:input.reason});await outbox(tx,task.id,cycle,'ASSIGNMENT_REJECTED',{userId:request.auth.userId});return presentTask(await tx.task.findUnique({where:{id:task.id},include:includeCurrent}));
    }});
  },

  async complete(request,id,input,key){return executeIdempotent(prisma,{actorId:request.auth.userId,key,payload:{id,...input},operation:async(tx)=>{const{cycle,assignment}=await lockCurrent(tx,id);requireExpectedVersion(cycle,input.expectedVersion);transitionTo(cycle.status,'complete');if(!assignment||assignment.userId!==request.auth.userId)throw conflict('ASSIGNMENT_NOT_CURRENT','Somente o responsável atual pode concluir a tarefa.');if(cycle.requests.length)throw conflict('PENDING_REQUEST_EXISTS','Há solicitação pendente para esta atribuição.');const openSubtasks=await tx.task.count({where:{parentCycleId:cycle.id,currentCycle:{status:{in:ACTIVE_STATUSES}}}});if(openSubtasks)throw new AppError(422,'OPEN_SUBTASKS','Conclua ou cancele as subtarefas abertas.');const now=new Date();await tx.taskAssignment.update({where:{id:assignment.id},data:{endedAt:now,endReason:'COMPLETED'}});await tx.taskCycle.update({where:{id:cycle.id},data:{status:'COMPLETED',completionText:input.completionText,closedAt:now,version:{increment:1}}});await audit(tx,request,{entityType:'TaskCycle',entityId:cycle.id,action:'TASK_COMPLETED',afterJson:{completionText:input.completionText,closedAt:now}});await outbox(tx,id,cycle,'TASK_COMPLETED',{userId:request.auth.userId});return presentTask(await tx.task.findUnique({where:{id},include:includeCurrent}));}})},

  async cancel(request,id,input,key){return executeIdempotent(prisma,{actorId:request.auth.userId,key,payload:{id,...input},operation:async(tx)=>{const{root,children}=await lockForCancellation(tx,id);await requireManagement(tx,request,root.task.teamId,input.reason);requireExpectedVersion(root.cycle,input.expectedVersion);transitionTo(root.cycle.status,'cancel');const now=new Date();for(const child of children){await closePendingRequests(tx,child.currentCycle.id,'CLOSED_BY_CANCELLATION',request.auth.userId,now);await tx.taskAssignment.updateMany({where:{cycleId:child.currentCycle.id,endedAt:null},data:{endedAt:now,endReason:'CANCELLED'}});await tx.taskCycle.update({where:{id:child.currentCycle.id},data:{status:'CANCELLED',closedAt:now,version:{increment:1}}});await audit(tx,request,{entityType:'TaskCycle',entityId:child.currentCycle.id,action:'SUBTASK_CANCELLED_WITH_PARENT',reason:input.reason});}await closePendingRequests(tx,root.cycle.id,'CLOSED_BY_CANCELLATION',request.auth.userId,now);if(root.assignment)await tx.taskAssignment.update({where:{id:root.assignment.id},data:{endedAt:now,endReason:'CANCELLED'}});await tx.taskCycle.update({where:{id:root.cycle.id},data:{status:'CANCELLED',closedAt:now,version:{increment:1}}});await audit(tx,request,{entityType:'TaskCycle',entityId:root.cycle.id,action:'TASK_CANCELLED',afterJson:{closedAt:now,cancelledSubtasks:children.length},reason:input.reason});await outbox(tx,id,root.cycle,'TASK_CANCELLED');return presentTask(await tx.task.findUnique({where:{id},include:includeCurrent}));}})},
});
