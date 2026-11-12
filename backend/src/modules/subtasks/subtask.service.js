import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { lockTaskAggregate } from '../../infrastructure/database/transaction.js';
import { AppError } from '../../shared/errors/app-error.js';
import { executeIdempotent } from '../../shared/http/idempotency.js';
import { presentTask } from '../tasks/task.presenter.js';
import { requireExpectedVersion } from '../tasks/task.policy.js';

const taskInclude = {
  team: true,
  currentCycle: {
    include: { assignments: { include: { user: true }, orderBy: { assignedAt: 'desc' } } },
  },
};

const notFound = () => new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada.');

const scopeWhere = (actor) => {
  if (['ADMIN_MASTER', 'SECRETARY'].includes(actor.roleCode)) return {};
  if (actor.roleCode === 'MANAGER') {
    return { team: { managers: { some: { userId: actor.userId, endedAt: null } } } };
  }
  return {
    currentCycle: {
      assignments: { some: { userId: actor.userId, OR: [{ endedAt: null }, { endReason: 'COMPLETED' }] } },
    },
  };
};

async function canManageTeam(client, actor, teamId) {
  if (['ADMIN_MASTER', 'SECRETARY'].includes(actor.roleCode)) return true;
  if (actor.roleCode !== 'MANAGER') return false;
  return Boolean(await client.teamManager.findFirst({
    where: { teamId, userId: actor.userId, endedAt: null },
  }));
}

async function eligibleAssignee(client, userId, teamId, actorId) {
  const user = await client.user.findFirst({
    where: { id: userId, isActive: true, deletedAt: null },
    include: {
      role: true,
      memberships: { where: { teamId, leftAt: null } },
      managedTeams: { where: { teamId, endedAt: null } },
    },
  });
  const globalSelf = user?.id === actorId && ['SECRETARY', 'ADMIN_MASTER'].includes(user?.role.code);
  return user && (user.memberships.length || user.managedTeams.length || globalSelf) ? user : null;
}

export const createSubtaskService = ({ prisma }) => ({
  async list(actor, taskId) {
    const parent = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null, ...scopeWhere(actor) },
      select: { currentCycleId: true },
    });
    if (!parent?.currentCycleId) throw notFound();
    const subtasks = await prisma.task.findMany({
      where: { parentCycleId: parent.currentCycleId, deletedAt: null },
      include: taskInclude,
      orderBy: { createdAt: 'asc' },
    });
    return subtasks.map(presentTask);
  },

  async create(request, taskId, input, key) {
    return executeIdempotent(prisma, {
      actorId: request.auth.userId,
      key,
      payload: { taskId, ...input },
      status: 201,
      operation: async (tx) => {
        const rows = await tx.$queryRaw(Prisma.sql`
          SELECT id, teamId, parentCycleId, currentCycleId
          FROM tasks
          WHERE id = ${taskId} AND deletedAt IS NULL
          FOR UPDATE
        `);
        const parent = rows[0];
        if (!parent?.currentCycleId) throw notFound();
        if (parent.parentCycleId) {
          throw new AppError(422, 'NESTED_SUBTASK_NOT_ALLOWED', 'Uma subtarefa não pode possuir subtarefas.');
        }
        await lockTaskAggregate(tx, { rootTaskId: parent.id, cycleIds: [parent.currentCycleId] });
        const parentCycle = await tx.taskCycle.findUnique({ where: { id: parent.currentCycleId } });
        if (!parentCycle || parentCycle.closedAt) {
          throw new AppError(409, 'PARENT_CYCLE_CLOSED', 'Não é possível criar subtarefa em ciclo encerrado.');
        }
        requireExpectedVersion(parentCycle, input.expectedVersion);
        if (!(await canManageTeam(tx, request.auth, parent.teamId))) throw notFound();
        if (request.auth.roleCode === 'ADMIN_MASTER' && !input.reason) {
          throw new AppError(422, 'ADMIN_REASON_REQUIRED', 'A intervenção do ADMIN MASTER exige justificativa.');
        }
        if (input.deadlineAt <= new Date() && !input.reason) {
          throw new AppError(422, 'PAST_DEADLINE_REASON_REQUIRED', 'Prazo vencido exige justificativa.');
        }
        const assignee = await eligibleAssignee(tx, input.userId, parent.teamId, request.auth.userId);
        if (!assignee) {
          throw new AppError(422, 'ASSIGNEE_NOT_ELIGIBLE', 'O responsável não está ativo ou elegível para a equipe.');
        }
        const calendar = await tx.workCalendar.findFirst({
          where: { teamId: parent.teamId, activeVersionId: { not: null } },
        });
        if (!calendar?.activeVersionId) {
          throw new AppError(422, 'ACTIVE_CALENDAR_REQUIRED', 'A equipe precisa de uma versão ativa de calendário antes da atribuição.');
        }

        const now = new Date();
        const subtaskId = randomUUID();
        const cycleId = randomUUID();
        const assignmentId = randomUUID();
        await tx.task.create({
          data: {
            id: subtaskId,
            teamId: parent.teamId,
            createdById: request.auth.userId,
            parentCycleId: parentCycle.id,
          },
        });
        const cycle = await tx.taskCycle.create({
          data: {
            id: cycleId,
            taskId: subtaskId,
            cycleNumber: 1,
            title: input.title,
            description: input.description,
            priority: input.priority,
            status: 'AWAITING_ACCEPTANCE',
            deadlineAt: input.deadlineAt,
            openedAt: now,
          },
        });
        await tx.task.update({ where: { id: subtaskId }, data: { currentCycleId: cycle.id } });
        await tx.taskAssignment.create({
          data: {
            id: assignmentId,
            cycleId: cycle.id,
            userId: assignee.id,
            assignedById: request.auth.userId,
            calendarVersionId: calendar.activeVersionId,
            assignedAt: now,
          },
        });
        await tx.deadlineChange.create({
          data: {
            id: randomUUID(),
            cycleId: cycle.id,
            oldDeadlineAt: null,
            newDeadlineAt: input.deadlineAt,
            reason: input.reason ?? 'Prazo definido na criação da subtarefa.',
            changedById: request.auth.userId,
          },
        });
        await tx.taskCycle.update({
          where: { id: parentCycle.id },
          data: { version: { increment: 1 } },
        });
        await tx.auditEvent.createMany({
          data: [
            {
              id: randomUUID(), actorId: request.auth.userId, correlationId: request.correlationId,
              entityType: 'Task', entityId: subtaskId, action: 'SUBTASK_CREATED',
              afterJson: { parentTaskId: parent.id, parentCycleId: parentCycle.id, cycleId, title: cycle.title },
              reason: input.reason,
            },
            {
              id: randomUUID(), actorId: request.auth.userId, correlationId: request.correlationId,
              entityType: 'TaskAssignment', entityId: assignmentId, action: 'SUBTASK_ASSIGNED',
              afterJson: { taskId: subtaskId, cycleId, userId: assignee.id, deadlineAt: input.deadlineAt },
              reason: input.reason,
            },
          ],
        });
        await tx.outboxEvent.create({
          data: {
            id: randomUUID(),
            eventType: 'SUBTASK_CREATED',
            payloadJson: { taskId: subtaskId, cycleId, parentTaskId: parent.id, parentCycleId: parentCycle.id, userId: assignee.id },
            dedupeKey: `subtask:${subtaskId}:created`,
          },
        });
        return presentTask(await tx.task.findUnique({ where: { id: subtaskId }, include: taskInclude }));
      },
    });
  },
});
