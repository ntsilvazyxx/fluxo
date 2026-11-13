import { randomUUID } from 'node:crypto';
import { lockTaskAggregate } from '../../infrastructure/database/transaction.js';
import { AppError } from '../../shared/errors/app-error.js';
import { executeIdempotent } from '../../shared/http/idempotency.js';
import { requireExpectedVersion } from '../tasks/task.policy.js';
import { createDeadlineService } from '../deadline/deadline.service.js';

const missing = () => new AppError(404, 'REQUEST_NOT_FOUND', 'Solicitação não encontrada.');
const conflict = (code, message) => new AppError(409, code, message);
const audit = (tx, req, data) => tx.auditEvent.create({ data: { id: randomUUID(), actorId: req.auth.userId, correlationId: req.correlationId, ...data } });
const outbox = (tx, taskId, requestId, type, payload = {}) => tx.outboxEvent.create({ data: { id: randomUUID(), eventType: type, payloadJson: { taskId, requestId, ...payload }, dedupeKey: `request:${requestId}:${type}` } });

async function canManage(client, actor, teamId) {
  if (['ADMIN_MASTER', 'SECRETARY'].includes(actor.roleCode)) return true;
  if (actor.roleCode !== 'MANAGER') return false;
  return Boolean(await client.teamManager.findFirst({ where: { teamId, userId: actor.userId, endedAt: null } }));
}

async function lockTask(client, taskId) {
  const initial = await client.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { id: true, teamId: true, parentCycleId: true, currentCycleId: true } });
  if (!initial?.currentCycleId) throw new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada.');
  let parentCycle = null;
  if (initial.parentCycleId) {
    parentCycle = await client.taskCycle.findUnique({ where: { id: initial.parentCycleId }, select: { id: true, taskId: true, closedAt: true } });
    if (!parentCycle) throw new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada.');
    await lockTaskAggregate(client, { rootTaskId: parentCycle.taskId, subtaskIds: [initial.id], cycleIds: [parentCycle.id, initial.currentCycleId] });
  } else await lockTaskAggregate(client, { rootTaskId: initial.id, cycleIds: [initial.currentCycleId] });
  const task = await client.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { id: true, teamId: true, parentCycleId: true, currentCycleId: true } });
  if (!task?.currentCycleId) throw new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada.');
  if (parentCycle) {
    parentCycle = await client.taskCycle.findUnique({ where: { id: parentCycle.id } });
    if (!parentCycle || parentCycle.closedAt) throw conflict('PARENT_CYCLE_CLOSED', 'O ciclo principal da subtarefa foi encerrado.');
  }
  const cycle = await client.taskCycle.findUnique({ where: { id: task.currentCycleId }, include: { assignments: { where: { endedAt: null } }, requests: { where: { status: 'PENDING' } } } });
  if (!cycle || cycle.closedAt) throw conflict('TASK_CYCLE_CLOSED', 'O ciclo atual foi encerrado.');
  const assignment = cycle.assignments[0] ?? null;
  if (assignment) await lockTaskAggregate(client, { assignmentIds: [assignment.id], requestIds: cycle.requests.map((r) => r.id) });
  return { task, cycle, assignment };
}

const view = (r) => ({ id: r.id, cycleId: r.cycleId, assignmentId: r.assignmentId, type: r.type, status: r.status, reason: r.reason, proposedDeadlineAt: r.proposedDeadlineAt, decidedById: r.decidedById, decidedAt: r.decidedAt, decisionReason: r.decisionReason, createdAt: r.createdAt, updatedAt: r.updatedAt, pauses: r.pauseIntervals ?? [] });

export const createRequestService = ({ prisma }) => {
  const deadlineService = createDeadlineService({ prisma });

  async function list(actor, taskId) {
    const task = await prisma.task.findFirst({
      where: {
        id: taskId, deletedAt: null, ...(['ADMIN_MASTER', 'SECRETARY'].includes(actor.roleCode)
          ? {} : actor.roleCode === 'MANAGER'
            ? { team: { managers: { some: { userId: actor.userId, endedAt: null } } } }
            : { cycles: { some: { assignments: { some: { userId: actor.userId } } } } }),
      },
      include: { cycles: { select: { id: true } } },
    });
    if (!task) throw new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada.');
    return (await prisma.taskRequest.findMany({
      where: { cycleId: { in: task.cycles.map((c) => c.id) } },
      include: { pauseIntervals: true },
      orderBy: { createdAt: 'asc' },
    })).map(view);
  }

  async function create(request, taskId, input, key) {
    return executeIdempotent(prisma, { actorId: request.auth.userId, key, payload: { taskId, ...input }, status: 201, operation: async (tx) => {
      const { task, cycle, assignment } = await lockTask(tx, taskId);
      requireExpectedVersion(cycle, input.expectedVersion);
      if (cycle.status !== 'IN_PROGRESS' || !assignment || assignment.userId !== request.auth.userId || !assignment.acceptedAt) throw conflict('REQUEST_NOT_ALLOWED', 'Somente o responsável atual de uma tarefa em andamento pode solicitar.');
      if (cycle.requests.length) throw conflict('PENDING_REQUEST_EXISTS', 'Já existe solicitação pendente para esta atribuição.');
      if (input.type === 'EXTENSION' && (!cycle.executionDeadlineAt || input.proposedDeadlineAt <= cycle.executionDeadlineAt)) throw new AppError(422, 'INVALID_PROPOSED_DEADLINE', 'O prazo proposto deve ser posterior ao prazo atual.');
      const created = await tx.taskRequest.create({ data: { id: randomUUID(), cycleId: cycle.id, assignmentId: assignment.id, type: input.type, reason: input.reason, proposedDeadlineAt: input.proposedDeadlineAt ?? null } });
      const now = new Date();
      if (input.type === 'RETURN') {
        await tx.taskPauseInterval.create({ data: { id: randomUUID(), assignmentId: assignment.id, requestId: created.id, startedAt: now } });
      }
      await tx.taskCycle.update({ where: { id: cycle.id }, data: { version: { increment: 1 } } });
      await audit(tx, request, { entityType: 'TaskRequest', entityId: created.id, action: input.type === 'RETURN' ? 'RETURN_REQUESTED' : 'EXTENSION_REQUESTED', afterJson: { taskId, type: input.type, proposedDeadlineAt: input.proposedDeadlineAt ?? null }, reason: input.reason });
      await outbox(tx, task.id, created.id, input.type === 'RETURN' ? 'RETURN_REQUESTED' : 'EXTENSION_REQUESTED', { assignmentId: assignment.id });
      return view(await tx.taskRequest.findUnique({ where: { id: created.id }, include: { pauseIntervals: true } }));
    } });
  }

  async function decide(request, requestId, input, key, approved) {
    return executeIdempotent(prisma, { actorId: request.auth.userId, key, payload: { requestId, ...input, approved }, operation: async (tx) => {
      const initial = await tx.taskRequest.findUnique({ where: { id: requestId }, include: { cycle: { include: { task: true } } } });
      if (!initial) throw missing();
      const { task, cycle, assignment } = await lockTask(tx, initial.cycle.taskId);
      requireExpectedVersion(cycle, input.expectedVersion);
      if (!(await canManage(tx, request.auth, task.teamId))) throw missing();
      if (request.auth.roleCode === 'ADMIN_MASTER' && !input.reason) throw new AppError(422, 'ADMIN_REASON_REQUIRED', 'A intervenção do ADMIN MASTER exige justificativa.');
      const current = await tx.taskRequest.findUnique({ where: { id: requestId }, include: { pauseIntervals: { where: { endedAt: null } } } });
      if (!current || current.status !== 'PENDING' || current.cycleId !== cycle.id || !assignment || current.assignmentId !== assignment.id) throw conflict('REQUEST_NOT_CURRENT', 'A solicitação ou atribuição não é mais atual.');
      const now = new Date(), status = approved ? 'APPROVED' : 'DENIED';
      if (!approved && !input.reason) throw new AppError(422, 'DECISION_REASON_REQUIRED', 'O indeferimento exige justificativa.');
      if (current.type === 'RETURN') {
        await tx.taskPauseInterval.updateMany({ where: { requestId: current.id, endedAt: null }, data: { endedAt: now } });
        if (approved) {
          const pauseInterval = await tx.taskPauseInterval.findUnique({ where: { id: current.pauseIntervals[0].id } });
          const pauseDurationMs = pauseInterval ? pauseInterval.endedAt.getTime() - pauseInterval.startedAt.getTime() : 0;
          let newExecutionDeadlineAt = null;
          if (cycle.executionDeadlineAt && pauseDurationMs > 0) {
            newExecutionDeadlineAt = new Date(cycle.executionDeadlineAt.getTime() + pauseDurationMs);
          }
          await tx.taskAssignment.update({ where: { id: assignment.id }, data: { endedAt: now, endReason: 'RETURN_APPROVED' } });
          await tx.taskCycle.update({
            where: { id: cycle.id },
            data: { status: 'PENDING', executionDeadlineAt: newExecutionDeadlineAt ?? cycle.executionDeadlineAt, version: { increment: 1 } },
          });
          await deadlineService.recordDeadlineChange(tx, cycle.id, cycle.executionDeadlineAt, newExecutionDeadlineAt ?? cycle.executionDeadlineAt, 'RETURN_PAUSE', `Pausa por devolução aprovada: ${input.reason ?? ''}`, request.auth.userId);
        } else {
          await tx.taskCycle.update({ where: { id: cycle.id }, data: { version: { increment: 1 } } });
        }
      } else if (current.type === 'EXTENSION') {
        if (approved) {
          if (!cycle.executionDeadlineAt || !current.proposedDeadlineAt || current.proposedDeadlineAt <= cycle.executionDeadlineAt) throw conflict('REQUEST_DEADLINE_OBSOLETE', 'O prazo proposto não é mais válido para o ciclo atual.');
          await tx.deadlineChange.create({
            data: { id: randomUUID(), cycleId: cycle.id, oldDeadlineAt: cycle.executionDeadlineAt, newDeadlineAt: current.proposedDeadlineAt, kind: 'EXECUTION_EXTENSION', reason: current.reason, changedById: request.auth.userId },
          });
          await tx.taskCycle.update({ where: { id: cycle.id }, data: { executionDeadlineAt: current.proposedDeadlineAt, version: { increment: 1 } } });
        } else {
          await tx.taskCycle.update({ where: { id: cycle.id }, data: { version: { increment: 1 } } });
        }
      }
      await tx.taskRequest.update({ where: { id: requestId }, data: { status, decidedAt: now, decidedById: request.auth.userId, decisionReason: input.reason ?? null } });
      await audit(tx, request, {
        entityType: 'TaskRequest',
        entityId: current.id,
        action: `${current.type}_${status}`,
        beforeJson: { status: 'PENDING', proposedDeadlineAt: current.proposedDeadlineAt },
        afterJson: { status, decidedAt: now, decisionReason: input.reason ?? null },
        reason: input.reason,
      });
      await outbox(tx, task.id, current.id, `${current.type}_${status}`, { decidedById: request.auth.userId, decidedAt: now });
      return view(await tx.taskRequest.findUnique({ where: { id: requestId }, include: { pauseIntervals: true } }));
    } });
  }

  return { list, create, decide };
};
