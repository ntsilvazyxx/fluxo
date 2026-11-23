import { randomUUID } from 'node:crypto';
import { lockTaskAggregate, runCriticalTransaction } from '../../infrastructure/database/transaction.js';
import { AppError } from '../../shared/errors/app-error.js';
import {
  isTaskManager,
  canViewMetadata,
  canInitializeConversation,
} from './chat.policy.js';
import { presentConversation } from './chat.presenter.js';
import { ensureParticipantActive } from './chat-participant.service.js';

export const createChatService = ({ prisma }) => {
  const ensureConversationForTask = async (client, taskId, currentCycleId, creatorId, initialAssigneeId) => {
    let conversation = await client.chatConversation.findUnique({
      where: { taskId },
    });

    if (conversation) {
      return conversation;
    }

    const conversationId = randomUUID();
    try {
      conversation = await client.chatConversation.create({
        data: {
          id: conversationId,
          taskId,
        },
      });
    } catch (err) {
      // Concorrência defensiva: se outra transação concorrente inseriu a conversa
      if (err?.code === 'P2002' || (err?.message && err.message.includes('Unique constraint'))) {
        conversation = await client.chatConversation.findUnique({
          where: { taskId },
        });
        if (conversation) {
          return conversation;
        }
      }
      throw err;
    }

    // Estado inicial de bloqueio vinculado ao ciclo vigente da tarefa
    await client.chatLockState.create({
      data: {
        id: randomUUID(),
        conversationId: conversation.id,
        cycleId: currentCycleId,
        isLocked: false,
      },
    });

    // Inclusão obrigatória do criador como participante ativo
    if (creatorId) {
      await ensureParticipantActive(client, conversation.id, creatorId, creatorId);
    }

    // Inclusão obrigatória do primeiro responsável como participante ativo
    if (initialAssigneeId && initialAssigneeId !== creatorId) {
      await ensureParticipantActive(client, conversation.id, initialAssigneeId, creatorId || initialAssigneeId);
    }

    return conversation;
  };

  const handleTaskReassignment = async (client, taskId, currentCycleId, actorId, newAssigneeId, _previousAssigneeId) => {
    let conversation = await client.chatConversation.findUnique({
      where: { taskId },
    });

    if (!conversation) {
      conversation = await ensureConversationForTask(client, taskId, currentCycleId, actorId, newAssigneeId);
      return conversation;
    }

    // O responsável anterior é PRESERVADO como participante ativo (período não é encerrado)
    // O novo responsável é garantido de forma idempotente como participante ativo
    if (newAssigneeId) {
      await ensureParticipantActive(client, conversation.id, newAssigneeId, actorId);
    }

    return conversation;
  };

  const getConversation = async (actor, taskId) => {
    const task = await prisma.task.findUnique({
      where: { id: taskId, deletedAt: null },
      include: {
        team: {
          include: {
            managers: { where: { endedAt: null } },
          },
        },
        currentCycle: true,
      },
    });

    if (!task) {
      throw new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada.');
    }

    const conversation = await prisma.chatConversation.findUnique({
      where: { taskId },
      include: {
        lockState: {
          include: {
            lockedBy: { select: { id: true, name: true } },
          },
        },
        task: {
          select: { id: true, publicNumber: true },
        },
        participants: {
          include: {
            user: { include: { role: true } },
            periods: {
              orderBy: { joinedAt: 'asc' },
              include: {
                addedBy: { select: { id: true, name: true } },
                removedBy: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new AppError(404, 'CHAT_NOT_INITIALIZED', 'O chat desta tarefa ainda não foi inicializado.');
    }

    const isManager = isTaskManager(actor, task);
    const myParticipant = conversation.participants?.find((p) => p.userId === actor.userId) ?? null;

    if (!canViewMetadata(actor, task, conversation, myParticipant, isManager)) {
      throw new AppError(403, 'FORBIDDEN', 'Você não tem permissão para acessar os metadados desta conversa.');
    }

    return presentConversation(conversation, {
      currentUserId: actor.userId,
      unreadCount: 0,
    });
  };

  const initLegacyConversation = async (actor, taskId, reason) => {
    const task = await prisma.task.findUnique({
      where: { id: taskId, deletedAt: null },
      include: {
        team: {
          include: {
            managers: { where: { endedAt: null } },
          },
        },
        currentCycle: {
          include: {
            assignments: {
              where: { endedAt: null },
            },
          },
        },
      },
    });

    if (!task) {
      throw new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada.');
    }

    const existing = await prisma.chatConversation.findUnique({
      where: { taskId },
    });

    const isManager = isTaskManager(actor, task);

    if (existing) {
      throw new AppError(409, 'CHAT_ALREADY_INITIALIZED', 'O chat desta tarefa já foi inicializado.');
    }

    if (!task.currentCycleId) {
      throw new AppError(422, 'TASK_NOT_FORWARDED', 'A tarefa ainda não foi encaminhada e não pode possuir chat.');
    }

    if (!canInitializeConversation(actor, task, existing, isManager)) {
      throw new AppError(403, 'FORBIDDEN', 'Sem permissão para inicializar o chat desta tarefa.');
    }

    await runCriticalTransaction(prisma, async (tx) => {
      // Bloqueio pessimista do agregado para serializar contra encaminhamentos concorrentes
      if (typeof tx.$queryRaw === 'function') {
        await lockTaskAggregate(tx, { rootTaskId: task.id, cycleIds: [task.currentCycleId] });
      }

      // Re-verificação de existência sob lock
      const lockedExisting = await tx.chatConversation.findUnique({
        where: { taskId: task.id },
      });
      if (lockedExisting) {
        throw new AppError(409, 'CHAT_ALREADY_INITIALIZED', 'O chat desta tarefa já foi inicializado.');
      }

      const currentAssigneeId = task.currentCycle?.assignments[0]?.userId ?? null;
      const conv = await ensureConversationForTask(
        tx,
        task.id,
        task.currentCycleId,
        task.createdById,
        currentAssigneeId
      );

      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          actorId: actor.userId,
          correlationId: actor.correlationId ?? randomUUID(),
          entityType: 'ChatConversation',
          entityId: conv.id,
          action: 'CHAT_INITIALIZED_LEGACY',
          reason: reason ?? null,
          afterJson: {
            taskId: task.id,
            currentCycleId: task.currentCycleId,
            creatorId: task.createdById,
            currentAssigneeId,
          },
        },
      });
    });

    return getConversation(actor, taskId);
  };

  return {
    ensureConversationForTask,
    handleTaskReassignment,
    getConversation,
    initLegacyConversation,
  };
};
