import { randomUUID } from 'node:crypto';
import { runCriticalTransaction } from '../../infrastructure/database/transaction.js';
import { AppError } from '../../shared/errors/app-error.js';
import {
  isTaskManager,
  canListParticipants,
  canManageParticipants,
} from './chat.policy.js';
import { presentParticipant } from './chat.presenter.js';

/**
 * Garante de forma idempotente que um usuário possua vínculo formal e um período ativo na conversa.
 * - Se o participante não existir, cria o participante e um novo período ativo.
 * - Se o participante já possuir um período ativo (endedAt === null), reutiliza o período sem duplicar.
 * - Se o participante existir mas todos os seus períodos estiverem encerrados, cria um novo período ativo.
 *
 * @param {object} client - Prisma Client ou Transaction Client
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} addedById
 * @returns {Promise<object>} Participant com períodos
 */
export async function ensureParticipantActive(client, conversationId, userId, addedById) {
  let participant = await client.chatParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    include: {
      periods: {
        orderBy: { joinedAt: 'desc' },
      },
    },
  });

  if (!participant) {
    const participantId = randomUUID();
    try {
      participant = await client.chatParticipant.create({
        data: {
          id: participantId,
          conversationId,
          userId,
        },
        include: {
          periods: true,
        },
      });
    } catch (err) {
      // Concorrência defensiva: se outra transação criou o participante no mesmo instante
      if (err?.code === 'P2002' || (err?.message && err.message.includes('Unique constraint'))) {
        participant = await client.chatParticipant.findUnique({
          where: {
            conversationId_userId: {
              conversationId,
              userId,
            },
          },
          include: {
            periods: {
              orderBy: { joinedAt: 'desc' },
            },
          },
        });
      } else {
        throw err;
      }
    }
  }

  const activePeriod = participant.periods?.find((p) => p.endedAt === null);
  if (activePeriod) {
    return participant;
  }

  const periodId = randomUUID();
  const now = new Date();
  try {
    await client.chatParticipationPeriod.create({
      data: {
        id: periodId,
        participantId: participant.id,
        joinedAt: now,
        endedAt: null,
        endReason: null,
        addedById,
      },
    });
  } catch (err) {
    // Se outra operação concorrente inseriu um período ativo no mesmo instante
    if (err?.code === 'P2002' || (err?.message && (err.message.includes('overlapping') || err.message.includes('period') || err.message.includes('SIGNAL SQLSTATE')))) {
      return client.chatParticipant.findUnique({
        where: { id: participant.id },
        include: {
          periods: {
            orderBy: { joinedAt: 'asc' },
          },
        },
      });
    }
    throw err;
  }

  return client.chatParticipant.findUnique({
    where: { id: participant.id },
    include: {
      periods: {
        orderBy: { joinedAt: 'asc' },
      },
    },
  });
}

export const createChatParticipantService = ({ prisma }) => ({
  ensureParticipantActive(client, conversationId, userId, addedById) {
    return ensureParticipantActive(client || prisma, conversationId, userId, addedById);
  },

  async listParticipants(actor, taskId, { activeOnly = false } = {}) {
    const task = await prisma.task.findUnique({
      where: { id: taskId, deletedAt: null },
      include: {
        team: {
          include: {
            managers: { where: { endedAt: null } },
          },
        },
      },
    });

    if (!task) {
      throw new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada.');
    }

    const conversation = await prisma.chatConversation.findUnique({
      where: { taskId },
    });

    if (!conversation) {
      throw new AppError(404, 'CHAT_NOT_INITIALIZED', 'O chat desta tarefa ainda não foi inicializado.');
    }

    const isManager = isTaskManager(actor, task);
    const myParticipant = await prisma.chatParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: conversation.id,
          userId: actor.userId,
        },
      },
      include: {
        periods: true,
      },
    });

    if (!canListParticipants(actor, task, conversation, myParticipant, isManager)) {
      throw new AppError(403, 'FORBIDDEN', 'Você não tem permissão para listar os participantes desta conversa.');
    }

    const participants = await prisma.chatParticipant.findMany({
      where: { conversationId: conversation.id },
      include: {
        user: {
          include: { role: true },
        },
        periods: {
          orderBy: { joinedAt: 'asc' },
          include: {
            addedBy: { select: { id: true, name: true } },
            removedBy: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const filtered = activeOnly
      ? participants.filter((p) => p.periods?.some((period) => period.endedAt === null))
      : participants;

    return filtered.map(presentParticipant);
  },

  async addParticipant(actor, taskId, targetUserId) {
    const task = await prisma.task.findUnique({
      where: { id: taskId, deletedAt: null },
      include: {
        team: {
          include: {
            managers: { where: { endedAt: null } },
          },
        },
      },
    });

    if (!task) {
      throw new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada.');
    }

    const isManager = isTaskManager(actor, task);
    if (!canManageParticipants(actor, task, isManager)) {
      throw new AppError(403, 'FORBIDDEN', 'Você não possui permissão para gerenciar participantes nesta tarefa.');
    }

    const conversation = await prisma.chatConversation.findUnique({
      where: { taskId },
    });

    if (!conversation) {
      throw new AppError(404, 'CHAT_NOT_INITIALIZED', 'O chat desta tarefa ainda não foi inicializado.');
    }

    const targetUser = await prisma.user.findFirst({
      where: { id: targetUserId, isActive: true, deletedAt: null },
      include: { role: true },
    });

    if (!targetUser) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado ou inativo.');
    }

    return runCriticalTransaction(prisma, async (tx) => {
      const participant = await ensureParticipantActive(tx, conversation.id, targetUserId, actor.userId);

      const full = await tx.chatParticipant.findUnique({
        where: { id: participant.id },
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
      });

      return presentParticipant(full);
    });
  },

  async removeParticipant(actor, taskId, participantId, endReason = 'REMOVED_BY_MANAGER') {
    const task = await prisma.task.findUnique({
      where: { id: taskId, deletedAt: null },
      include: {
        team: {
          include: {
            managers: { where: { endedAt: null } },
          },
        },
      },
    });

    if (!task) {
      throw new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada.');
    }

    const isManager = isTaskManager(actor, task);
    if (!canManageParticipants(actor, task, isManager)) {
      throw new AppError(403, 'FORBIDDEN', 'Você não possui permissão para gerenciar participantes nesta tarefa.');
    }

    const conversation = await prisma.chatConversation.findUnique({
      where: { taskId },
    });

    if (!conversation) {
      throw new AppError(404, 'CHAT_NOT_INITIALIZED', 'O chat desta tarefa ainda não foi inicializado.');
    }

    const participant = await prisma.chatParticipant.findUnique({
      where: { id: participantId },
      include: {
        periods: {
          where: { endedAt: null },
        },
      },
    });

    if (!participant || participant.conversationId !== conversation.id) {
      throw new AppError(404, 'PARTICIPANT_NOT_FOUND', 'Participante não encontrado nesta conversa.');
    }

    const activePeriod = participant.periods?.find((p) => p.endedAt === null);
    if (!activePeriod) {
      throw new AppError(409, 'PARTICIPANT_ALREADY_INACTIVE', 'O participante já está inativo nesta conversa.');
    }

    return runCriticalTransaction(prisma, async (tx) => {
      const now = new Date();
      await tx.chatParticipationPeriod.update({
        where: { id: activePeriod.id },
        data: {
          endedAt: now,
          endReason: endReason || 'REMOVED_BY_MANAGER',
          removedById: actor.userId,
        },
      });

      const full = await tx.chatParticipant.findUnique({
        where: { id: participant.id },
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
      });

      return presentParticipant(full);
    });
  },
});
