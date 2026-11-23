import { randomUUID } from 'node:crypto';
import { runCriticalTransaction } from '../../infrastructure/database/transaction.js';
import { AppError } from '../../shared/errors/app-error.js';
import {
  isTaskManager,
  canSendMessage,
  canReadMessageContent,
  canAdvanceReadCursor,
} from './chat.policy.js';
import {
  presentMessage,
  presentPaginatedMessages,
  presentReadReceipt,
  presentFunctionalReadState,
  safeBigInt,
} from './chat.presenter.js';

export const createChatMessageService = ({ prisma }) => {
  const sendMessage = async (actor, taskId, payload) => {
    // 1. Validar existência da tarefa
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

    if (!task.currentCycleId) {
      throw new AppError(422, 'TASK_NOT_FORWARDED', 'A tarefa ainda não possui ciclo ativo.');
    }

    // 2. Validar existência da conversa
    const conversation = await prisma.chatConversation.findUnique({
      where: { taskId },
      include: {
        lockState: true,
      },
    });

    if (!conversation) {
      throw new AppError(404, 'CHAT_NOT_INITIALIZED', 'O chat desta tarefa ainda não foi inicializado.');
    }

    // 3. Verificar estado de bloqueio
    if (conversation.lockState?.isLocked) {
      throw new AppError(423, 'CHAT_LOCKED', 'O chat desta tarefa está temporariamente bloqueado.');
    }

    // 4. Buscar vínculo de participante do autor autenticado
    const participant = await prisma.chatParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: conversation.id,
          userId: actor.userId,
        },
      },
      include: {
        periods: {
          where: { endedAt: null },
        },
      },
    });

    // 5. Validar autorização pelo RBAC
    if (!canSendMessage(actor, task, conversation, conversation.lockState, participant)) {
      throw new AppError(403, 'FORBIDDEN', 'Você não possui participação ativa nesta conversa para enviar mensagens.');
    }

    // 6. Transação de envio com idempotência e sequência monotônica
    return runCriticalTransaction(prisma, async (tx) => {
      // 6.1 Idempotência pré-lock: verificar se clientMessageId já existe
      const existing = await tx.chatMessage.findUnique({
        where: {
          conversationId_clientMessageId: {
            conversationId: conversation.id,
            clientMessageId: payload.clientMessageId,
          },
        },
        include: {
          author: { include: { role: true } },
          attachments: true,
          conversation: { select: { taskId: true } },
        },
      });

      if (existing) {
        // Idempotência estrita: comparar payload e autor
        const contentMatches = (existing.content ?? '') === (payload.content ?? '');
        const authorMatches = existing.authorId === actor.userId;

        if (contentMatches && authorMatches) {
          return presentMessage(existing, { taskId });
        }

        throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'O clientMessageId já foi utilizado com conteúdo diferente.');
      }

      // 6.2 Serialização de concorrência com row lock na conversa
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id FROM chat_conversations WHERE id = ${conversation.id} FOR UPDATE`;
      }

      // 6.2.1 Re-validação transacional de bloqueio sob lock
      if (typeof tx.chatLockState?.findUnique === 'function') {
        const currentLock = await tx.chatLockState.findUnique({
          where: { conversationId: conversation.id },
        });

        if (currentLock?.isLocked) {
          throw new AppError(423, 'CHAT_LOCKED', 'O chat desta tarefa está temporariamente bloqueado.');
        }
      }

      // 6.2.2 Re-validação transacional de participação ativa sob lock
      if (typeof tx.chatParticipant?.findUnique === 'function') {
        const activeParticipant = await tx.chatParticipant.findUnique({
          where: {
            conversationId_userId: {
              conversationId: conversation.id,
              userId: actor.userId,
            },
          },
          include: {
            periods: {
              where: { endedAt: null },
            },
          },
        });

        if (!activeParticipant || !activeParticipant.periods?.length) {
          throw new AppError(403, 'FORBIDDEN', 'Você não possui participação ativa nesta conversa para enviar mensagens.');
        }
      }

      // 6.3 Re-verificação de clientMessageId sob lock para fechar corrida simultânea
      const lockedExisting = await tx.chatMessage.findUnique({
        where: {
          conversationId_clientMessageId: {
            conversationId: conversation.id,
            clientMessageId: payload.clientMessageId,
          },
        },
        include: {
          author: { include: { role: true } },
          attachments: true,
          conversation: { select: { taskId: true } },
        },
      });

      if (lockedExisting) {
        const contentMatches = (lockedExisting.content ?? '') === (payload.content ?? '');
        const authorMatches = lockedExisting.authorId === actor.userId;

        if (contentMatches && authorMatches) {
          return presentMessage(lockedExisting, { taskId });
        }

        throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'O clientMessageId já foi utilizado com conteúdo diferente.');
      }

      // 6.4 Obter sequência máxima atual da conversa
      const lastMessage = await tx.chatMessage.findFirst({
        where: { conversationId: conversation.id },
        orderBy: { sequenceNumber: 'desc' },
        select: { sequenceNumber: true },
      });

      const nextSequence = lastMessage ? BigInt(lastMessage.sequenceNumber) + 1n : 1n;

      // 6.5 Persistir nova mensagem publicada
      const messageId = randomUUID();
      const now = new Date();

      try {
        const created = await tx.chatMessage.create({
          data: {
            id: messageId,
            conversationId: conversation.id,
            cycleId: task.currentCycleId,
            authorId: actor.userId,
            sequenceNumber: nextSequence,
            clientMessageId: payload.clientMessageId,
            content: payload.content ? payload.content.trim() : null,
            status: 'PUBLISHED',
            createdAt: now,
            publishedAt: now,
          },
          include: {
            author: { include: { role: true } },
            attachments: true,
            conversation: { select: { taskId: true } },
          },
        });

        return presentMessage(created, { taskId });
      } catch (err) {
        // Concorrência defensiva: captura de P2002 na constraint única de clientMessageId
        if (err?.code === 'P2002') {
          const raceExisting = await tx.chatMessage.findUnique({
            where: {
              conversationId_clientMessageId: {
                conversationId: conversation.id,
                clientMessageId: payload.clientMessageId,
              },
            },
            include: {
              author: { include: { role: true } },
              attachments: true,
              conversation: { select: { taskId: true } },
            },
          });

          if (raceExisting) {
            const contentMatches = (raceExisting.content ?? '') === (payload.content ?? '');
            const authorMatches = raceExisting.authorId === actor.userId;

            if (contentMatches && authorMatches) {
              return presentMessage(raceExisting, { taskId });
            }

            throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'O clientMessageId já foi utilizado com conteúdo diferente.');
          }
        }
        throw err;
      }
    });
  };

  const listMessages = async (actor, taskId, query = {}) => {
    // 1. Validar existência da tarefa
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

    // 2. Validar existência da conversa
    const conversation = await prisma.chatConversation.findUnique({
      where: { taskId },
    });

    if (!conversation) {
      throw new AppError(404, 'CHAT_NOT_INITIALIZED', 'O chat desta tarefa ainda não foi inicializado.');
    }

    // 3. Buscar participante
    const participant = await prisma.chatParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: conversation.id,
          userId: actor.userId,
        },
      },
      include: {
        periods: {
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    const isManager = isTaskManager(actor, task);

    // 4. Validar permissão de leitura pelo RBAC
    if (!canReadMessageContent(actor, task, conversation, participant, isManager)) {
      throw new AppError(403, 'FORBIDDEN', 'Você não tem permissão para ler as mensagens desta conversa.');
    }

    // 5. Montar cláusula where respeitando privacidade e períodos históricos
    const where = {
      conversationId: conversation.id,
      status: query.status ?? 'PUBLISHED',
    };

    // Não expor mensagens PENDING ou FAILED de terceiros
    if (where.status !== 'PUBLISHED') {
      where.authorId = actor.userId;
    }

    // Isolamento histórico para participante não gestor
    if (!isManager) {
      const activePeriods = participant?.periods ?? [];
      if (activePeriods.length === 0) {
        return presentPaginatedMessages([], { limit: query.limit ?? 50, cursor: null, hasMore: false, totalCount: 0 }, { taskId });
      }

      where.OR = activePeriods.map((period) => {
        const interval = { gte: period.joinedAt };
        if (period.endedAt) {
          interval.lte = period.endedAt;
        }
        return { createdAt: interval };
      });
    }

    // Pesquisa textual restrita à conversa
    if (query.q) {
      where.content = { contains: query.q.trim() };
    }

    // Paginação por cursor de sequência
    if (query.beforeSequence !== undefined) {
      where.sequenceNumber = { lt: BigInt(query.beforeSequence) };
    } else if (query.afterSequence !== undefined) {
      where.sequenceNumber = { gt: BigInt(query.afterSequence) };
    }

    const limit = query.limit ?? 50;

    // Buscar mensagens ordenadas deterministicamente por sequenceNumber
    const isBefore = query.beforeSequence !== undefined;
    const rawMessages = await prisma.chatMessage.findMany({
      where,
      take: limit + 1,
      orderBy: { sequenceNumber: isBefore ? 'desc' : 'asc' },
      include: {
        author: { include: { role: true } },
        attachments: true,
        conversation: { select: { taskId: true } },
      },
    });

    const hasMore = rawMessages.length > limit;
    let items = hasMore ? rawMessages.slice(0, limit) : rawMessages;

    // Se a consulta foi reversa (beforeSequence), reordena cronologicamente
    if (isBefore) {
      items = items.reverse();
    }

    const cursor = items.length > 0 ? safeBigInt(items[items.length - 1].sequenceNumber) : null;
    const totalCount = await prisma.chatMessage.count({ where });

    return presentPaginatedMessages(
      items,
      {
        limit,
        cursor,
        hasMore,
        totalCount,
      },
      { taskId }
    );
  };

  const advanceReadCursor = async (actor, taskId, input) => {
    // 1. Validar existência da tarefa
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

    // 2. Validar existência da conversa
    const conversation = await prisma.chatConversation.findUnique({
      where: { taskId },
    });

    if (!conversation) {
      throw new AppError(404, 'CHAT_NOT_INITIALIZED', 'O chat desta tarefa ainda não foi inicializado.');
    }

    const isManager = isTaskManager(actor, task);
    const participant = await prisma.chatParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: conversation.id,
          userId: actor.userId,
        },
      },
      include: {
        periods: {
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    // 3. Validar permissão para avançar cursor
    if (!canAdvanceReadCursor(actor, task, participant, isManager)) {
      throw new AppError(403, 'FORBIDDEN', 'Você não possui permissão para atualizar o cursor de leitura nesta tarefa.');
    }

    // 4. Validar mensagem referenciada
    const targetSequence = BigInt(input.lastReadSequence);

    if (input.lastReadMessageId) {
      const targetMessage = await prisma.chatMessage.findUnique({
        where: { id: input.lastReadMessageId },
      });

      if (!targetMessage || targetMessage.conversationId !== conversation.id) {
        throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Mensagem referenciada não encontrada nesta conversa.');
      }

      if (targetMessage.status !== 'PUBLISHED') {
        throw new AppError(422, 'INVALID_READ_CURSOR', 'O cursor de leitura só pode avançar para mensagens publicadas.');
      }

      if (BigInt(targetMessage.sequenceNumber) !== targetSequence) {
        throw new AppError(422, 'INVALID_READ_CURSOR', 'A sequência informada não corresponde ao sequenceNumber da mensagem.');
      }

      // Validar que o usuário tem visibilidade sobre a mensagem (não pode avançar além de mensagens visíveis)
      if (!canReadMessageContent(actor, task, conversation, participant, isManager, targetMessage)) {
        throw new AppError(403, 'FORBIDDEN', 'Você não tem permissão para visualizar esta mensagem e não pode avançar o cursor.');
      }
    } else {
      if (targetSequence !== 0n) {
        throw new AppError(422, 'INVALID_READ_CURSOR', 'Sequência deve ser 0 quando nenhuma mensagem for indicada.');
      }
    }

    // 5. Atualizar cursor de leitura atomicamente
    return runCriticalTransaction(prisma, async (tx) => {
      const now = new Date();

      if (participant) {
        // Participante formal -> chat_read_receipts
        const existingReceipt = await tx.chatReadReceipt.findUnique({
          where: { participantId: participant.id },
        });

        if (existingReceipt) {
          if (targetSequence < BigInt(existingReceipt.lastReadSequence)) {
            throw new AppError(422, 'CURSOR_REGRESSION', 'O cursor de leitura não pode retroceder.');
          }

          const updated = await tx.chatReadReceipt.update({
            where: { id: existingReceipt.id },
            data: {
              lastReadMessageId: input.lastReadMessageId ?? null,
              lastReadSequence: targetSequence,
              lastReadAt: now,
            },
          });

          return presentReadReceipt(updated);
        }

        const created = await tx.chatReadReceipt.create({
          data: {
            id: randomUUID(),
            conversationId: conversation.id,
            participantId: participant.id,
            lastReadMessageId: input.lastReadMessageId ?? null,
            lastReadSequence: targetSequence,
            lastReadAt: now,
          },
        });

        return presentReadReceipt(created);
      }

      if (isManager) {
        // Gestor com acesso funcional -> chat_functional_read_states
        const existingState = await tx.chatFunctionalReadState.findUnique({
          where: {
            conversationId_userId: {
              conversationId: conversation.id,
              userId: actor.userId,
            },
          },
        });

        if (existingState) {
          if (targetSequence < BigInt(existingState.lastReadSequence)) {
            throw new AppError(422, 'CURSOR_REGRESSION', 'O cursor de leitura funcional não pode retroceder.');
          }

          const updated = await tx.chatFunctionalReadState.update({
            where: { id: existingState.id },
            data: {
              lastReadMessageId: input.lastReadMessageId ?? null,
              lastReadSequence: targetSequence,
              lastReadAt: now,
            },
          });

          return presentFunctionalReadState(updated);
        }

        const created = await tx.chatFunctionalReadState.create({
          data: {
            id: randomUUID(),
            conversationId: conversation.id,
            userId: actor.userId,
            lastReadMessageId: input.lastReadMessageId ?? null,
            lastReadSequence: targetSequence,
            lastReadAt: now,
          },
        });

        return presentFunctionalReadState(created);
      }

      throw new AppError(403, 'FORBIDDEN', 'Sem permissão para atualizar cursor de leitura.');
    });
  };

  return {
    sendMessage,
    listMessages,
    advanceReadCursor,
  };
};
