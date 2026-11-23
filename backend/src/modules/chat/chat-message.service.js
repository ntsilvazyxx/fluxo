import { randomUUID } from 'node:crypto';
import { runCriticalTransaction } from '../../infrastructure/database/transaction.js';
import { AppError } from '../../shared/errors/app-error.js';
import {
  isTaskManager,
  canSendMessage,
  canReadMessageContent,
  canDownloadAttachment,
  canAdvanceReadCursor,
} from './chat.policy.js';
import {
  presentMessage,
  presentPaginatedMessages,
  presentReadReceipt,
  presentFunctionalReadState,
  safeBigInt,
} from './chat.presenter.js';

export const createChatMessageService = ({
  prisma,
  storage = null,
  _config = null,
  now = () => new Date(),
  id = randomUUID,
}) => {
  const MAX_ATTACHMENTS_PER_MESSAGE = 5;
  const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB
  const MAX_TOTAL_ATTACHMENTS_BYTES = 50 * 1024 * 1024; // 50 MB

  const validateAndOrderStagedUploads = async (client, conversationId, userId, stagedIds) => {
    if (!stagedIds?.length) return [];
    if (stagedIds.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      throw new AppError(400, 'INVALID_ATTACHMENT_COUNT', `Máximo de ${MAX_ATTACHMENTS_PER_MESSAGE} anexos por mensagem.`);
    }
    const uniqueIds = new Set(stagedIds);
    if (uniqueIds.size !== stagedIds.length) {
      throw new AppError(400, 'DUPLICATE_ATTACHMENT_IDS', 'Não são permitidos identificadores de anexo repetidos no mesmo envio.');
    }

    const uploads = await client.chatAttachmentUpload.findMany({
      where: { id: { in: stagedIds } },
    });

    if (uploads.length !== stagedIds.length) {
      throw new AppError(404, 'CHAT_ATTACHMENT_UPLOAD_NOT_FOUND', 'Um ou mais anexos de staging não foram encontrados.');
    }

    const uploadsMap = new Map(uploads.map((u) => [u.id, u]));
    const ordered = stagedIds.map((stagedId) => uploadsMap.get(stagedId));

    let totalBytes = 0;
    const currentTime = now();

    for (const upload of ordered) {
      if (upload.conversationId !== conversationId) {
        throw new AppError(403, 'FORBIDDEN', 'O anexo não pertence à conversa desta tarefa.');
      }
      if (upload.uploadedById !== userId) {
        throw new AppError(403, 'FORBIDDEN', 'O anexo pertence a outro usuário.');
      }
      if (upload.expiresAt <= currentTime) {
        throw new AppError(422, 'CHAT_ATTACHMENT_EXPIRED', 'Anexo expirado não pode ser consumido.');
      }
      if (['EXPIRED', 'REJECTED', 'FAILED'].includes(upload.status)) {
        throw new AppError(422, 'CHAT_ATTACHMENT_NOT_ELIGIBLE', 'Anexo em estado inválido para vinculação.');
      }
      if (upload.status === 'PROMOTED') {
        throw new AppError(409, 'CHAT_ATTACHMENT_ALREADY_CLAIMED', 'Anexo já promovido em outra mensagem.');
      }
      if (Number(upload.sizeBytes) > MAX_ATTACHMENT_BYTES) {
        throw new AppError(413, 'CHAT_ATTACHMENT_TOO_LARGE', 'Arquivo excede o limite máximo permitido de 20MB.');
      }
      totalBytes += Number(upload.sizeBytes);
    }

    if (totalBytes > MAX_TOTAL_ATTACHMENTS_BYTES) {
      throw new AppError(413, 'CHAT_ATTACHMENTS_TOTAL_TOO_LARGE', 'O tamanho total dos anexos da mensagem excede o limite de 50MB.');
    }

    return ordered;
  };

  const isMessageIdempotentMatch = (existing, payload, stagedAttachmentIds, actorUserId) => {
    const authorMatches = existing.authorId === actorUserId;
    const expectedContent = payload.content ? payload.content.trim() : '';
    const actualContent = existing.content ? existing.content.trim() : '';
    const contentMatches = actualContent === expectedContent;

    const existingStagedIds = existing.attachments?.length
      ? existing.attachments.map((a) => a.sourceUploadId).filter(Boolean)
      : (existing.attachmentUploads?.map((u) => u.id) ?? []);

    const attachmentsMatch = stagedAttachmentIds.length === existingStagedIds.length
      && stagedAttachmentIds.every((attachId, idx) => attachId === existingStagedIds[idx]);

    return authorMatches && contentMatches && attachmentsMatch;
  };

  const publishAttachmentsForMessage = async (messageRecord, orderedUploads, taskId) => {
    // 1. Promover fisicamente cada anexo no storage
    for (const upload of orderedUploads) {
      const targetStorageKey = upload.targetStorageKey
        || (storage ? storage.createObjectKey() : `objects/${upload.id.slice(0, 2)}/${upload.id}.object`);

      if (storage && upload.status !== 'PROMOTED') {
        await storage.promote(upload.stagingKey, targetStorageKey, {
          sizeBytes: upload.sizeBytes,
          sha256: upload.sha256,
        });
        const verified = await storage.exists(targetStorageKey);
        if (!verified) {
          throw new AppError(500, 'STORAGE_PROMOTION_FAILED', 'Falha ao verificar anexo promovido no storage definitivo.');
        }
      }
      upload.targetStorageKey = targetStorageKey;
    }

    // 2. Transação para inserir attachments e publicar mensagem
    const publishedMessage = await runCriticalTransaction(prisma, async (tx) => {
      const existingAttachments = await tx.chatMessageAttachment.findMany({
        where: { messageId: messageRecord.id },
      });

      if (!existingAttachments.length) {
        for (let position = 0; position < orderedUploads.length; position++) {
          const upload = orderedUploads[position];
          await tx.chatMessageAttachment.create({
            data: {
              id: id(),
              messageId: messageRecord.id,
              sourceUploadId: upload.id,
              uploadedById: upload.uploadedById,
              position,
              originalName: upload.originalName,
              storagePath: upload.targetStorageKey,
              mimeType: upload.mimeType,
              sizeBytes: upload.sizeBytes,
              sha256: upload.sha256,
              origin: 'UPLOAD',
            },
          });

          await tx.chatAttachmentUpload.update({
            where: { id: upload.id },
            data: {
              status: 'PROMOTED',
              promotedAt: now(),
              targetStorageKey: upload.targetStorageKey,
            },
          });
        }
      }

      const publishedNow = now();
      return tx.chatMessage.update({
        where: { id: messageRecord.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: publishedNow,
          failureReason: null,
        },
        include: {
          author: { include: { role: true } },
          attachments: { orderBy: { position: 'asc' } },
          conversation: { select: { taskId: true } },
        },
      });
    });

    return presentMessage(publishedMessage, { taskId });
  };

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

    const stagedAttachmentIds = Array.isArray(payload.stagedAttachmentIds) ? payload.stagedAttachmentIds : [];

    // 6. Idempotência pré-lock: verificar se clientMessageId já existe
    const existingPre = typeof prisma.chatMessage?.findUnique === 'function'
      ? await prisma.chatMessage.findUnique({
        where: {
          conversationId_clientMessageId: {
            conversationId: conversation.id,
            clientMessageId: payload.clientMessageId,
          },
        },
        include: {
          author: { include: { role: true } },
          attachments: { orderBy: { position: 'asc' } },
          attachmentUploads: true,
          conversation: { select: { taskId: true } },
        },
      })
      : null;

    if (existingPre) {
      if (!isMessageIdempotentMatch(existingPre, payload, stagedAttachmentIds, actor.userId)) {
        throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'O clientMessageId já foi utilizado com conteúdo diferente.');
      }

      if (existingPre.status === 'PUBLISHED') {
        return presentMessage(existingPre, { taskId });
      }
    }

    // 7. Validar previamente os uploads de staging se informados
    let validatedUploads = [];
    if (stagedAttachmentIds.length > 0) {
      validatedUploads = await validateAndOrderStagedUploads(
        prisma,
        conversation.id,
        actor.userId,
        stagedAttachmentIds,
      );
    }

    // 8. Transação de reserva com idempotência e sequência monotônica
    const reservation = await runCriticalTransaction(prisma, async (tx) => {
      // 8.1 Idempotência dentro da transação
      const existing = await tx.chatMessage.findUnique({
        where: {
          conversationId_clientMessageId: {
            conversationId: conversation.id,
            clientMessageId: payload.clientMessageId,
          },
        },
        include: {
          author: { include: { role: true } },
          attachments: { orderBy: { position: 'asc' } },
          attachmentUploads: true,
          conversation: { select: { taskId: true } },
        },
      });

      if (existing) {
        if (!isMessageIdempotentMatch(existing, payload, stagedAttachmentIds, actor.userId)) {
          throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'O clientMessageId já foi utilizado com conteúdo diferente.');
        }

        if (existing.status === 'PUBLISHED') {
          return { published: presentMessage(existing, { taskId }) };
        }

        // Se está PENDING, retomar publicação
        return { pending: existing, orderedUploads: validatedUploads };
      }

      // 7.2 Serialização de concorrência com row lock na conversa
      if (typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id FROM chat_conversations WHERE id = ${conversation.id} FOR UPDATE`;
      }

      // 7.2.1 Re-validação transacional de bloqueio sob lock
      if (typeof tx.chatLockState?.findUnique === 'function') {
        const currentLock = await tx.chatLockState.findUnique({
          where: { conversationId: conversation.id },
        });

        if (currentLock?.isLocked) {
          throw new AppError(423, 'CHAT_LOCKED', 'O chat desta tarefa está temporariamente bloqueado.');
        }
      }

      // 7.2.2 Re-validação transacional de participação ativa sob lock
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

      // 7.3 Re-verificação de clientMessageId sob lock para fechar corrida simultânea
      const lockedExisting = await tx.chatMessage.findUnique({
        where: {
          conversationId_clientMessageId: {
            conversationId: conversation.id,
            clientMessageId: payload.clientMessageId,
          },
        },
        include: {
          author: { include: { role: true } },
          attachments: { orderBy: { position: 'asc' } },
          attachmentUploads: true,
          conversation: { select: { taskId: true } },
        },
      });

      if (lockedExisting) {
        if (!isMessageIdempotentMatch(lockedExisting, payload, stagedAttachmentIds, actor.userId)) {
          throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'O clientMessageId já foi utilizado com conteúdo diferente.');
        }

        if (lockedExisting.status === 'PUBLISHED') {
          return { published: presentMessage(lockedExisting, { taskId }) };
        }

        return { pending: lockedExisting, orderedUploads: validatedUploads };
      }

      // 7.4 Re-verificar que os uploads ainda estão disponíveis sob lock
      if (validatedUploads.length > 0) {
        for (const upload of validatedUploads) {
          const currentUpload = await tx.chatAttachmentUpload.findUnique({
            where: { id: upload.id },
          });

          if (!currentUpload || currentUpload.status !== 'READY' || currentUpload.messageId !== null) {
            throw new AppError(409, 'CHAT_ATTACHMENT_ALREADY_CLAIMED', 'Um dos anexos já foi reivindicado concorrentemente.');
          }
        }
      }

      // 7.5 Obter sequência máxima atual da conversa
      const lastMessage = await tx.chatMessage.findFirst({
        where: { conversationId: conversation.id },
        orderBy: { sequenceNumber: 'desc' },
        select: { sequenceNumber: true },
      });

      const nextSequence = lastMessage ? BigInt(lastMessage.sequenceNumber) + 1n : 1n;

      // 7.6 Persistir nova mensagem
      const messageId = id();
      const currentTime = now();
      const hasAttachments = validatedUploads.length > 0;

      // Caso 1: Mensagem sem anexos — fluxo direto homologado (status PUBLISHED)
      if (!hasAttachments) {
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
              createdAt: currentTime,
              publishedAt: currentTime,
            },
            include: {
              author: { include: { role: true } },
              attachments: true,
              conversation: { select: { taskId: true } },
            },
          });

          return { published: presentMessage(created, { taskId }) };
        } catch (err) {
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

            if (raceExisting && isMessageIdempotentMatch(raceExisting, payload, stagedAttachmentIds, actor.userId)) {
              return { published: presentMessage(raceExisting, { taskId }) };
            }
            throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'O clientMessageId já foi utilizado com conteúdo diferente.');
          }
          throw err;
        }
      }

      // Caso 2: Mensagem com anexos — cria em PENDING e reivindica uploads como CLAIMED
      const createdPending = await tx.chatMessage.create({
        data: {
          id: messageId,
          conversationId: conversation.id,
          cycleId: task.currentCycleId,
          authorId: actor.userId,
          sequenceNumber: nextSequence,
          clientMessageId: payload.clientMessageId,
          content: payload.content ? payload.content.trim() : null,
          status: 'PENDING',
          createdAt: currentTime,
          publishedAt: null,
        },
        include: {
          author: { include: { role: true } },
          attachments: true,
          conversation: { select: { taskId: true } },
        },
      });

      for (const upload of validatedUploads) {
        const targetStorageKey = upload.targetStorageKey
          || (storage ? storage.createObjectKey() : `objects/${upload.id.slice(0, 2)}/${upload.id}.object`);
        upload.targetStorageKey = targetStorageKey;

        await tx.chatAttachmentUpload.update({
          where: { id: upload.id },
          data: {
            status: 'CLAIMED',
            messageId: createdPending.id,
            claimedAt: currentTime,
            targetStorageKey,
          },
        });
      }

      return { pending: createdPending, orderedUploads: validatedUploads };
    });

    if (reservation.published) {
      return reservation.published;
    }

    // Publicação e promoção de anexos fora da transação de lock
    return publishAttachmentsForMessage(reservation.pending, reservation.orderedUploads, taskId);
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

  const getAttachmentForDownload = async (actor, taskId, messageId, attachmentId, correlationId = randomUUID()) => {
    const task = await prisma.task.findUnique({
      where: { id: taskId, deletedAt: null },
      include: {
        team: {
          include: {
            managers: {
              where: { endedAt: null },
            },
          },
        },
      },
    });

    if (!task) {
      throw new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada.');
    }

    const conversation = await prisma.chatConversation.findUnique({
      where: { taskId },
      include: { lockState: true },
    });

    if (!conversation) {
      throw new AppError(404, 'CHAT_NOT_INITIALIZED', 'O chat desta tarefa ainda não foi inicializado.');
    }

    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message || message.conversationId !== conversation.id || message.status !== 'PUBLISHED') {
      throw new AppError(404, 'CHAT_ATTACHMENT_NOT_FOUND', 'Anexo não encontrado ou não disponível para download.');
    }

    const attachment = await prisma.chatMessageAttachment.findUnique({
      where: { id: attachmentId },
      include: { sourceUpload: true },
    });

    if (!attachment || attachment.messageId !== message.id) {
      throw new AppError(404, 'CHAT_ATTACHMENT_NOT_FOUND', 'Anexo não encontrado ou não disponível para download.');
    }

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
    const authorized = canDownloadAttachment(
      actor,
      task,
      conversation,
      conversation.lockState,
      participant,
      isManager,
      message,
    );

    if (!authorized) {
      if (prisma.auditEvent?.create) {
        await prisma.auditEvent.create({
          data: {
            id: id(),
            actorId: actor.userId,
            entityType: 'ChatMessageAttachment',
            entityId: attachment.id,
            action: 'CHAT_ATTACHMENT_DOWNLOAD_DENIED',
            afterJson: {
              taskId,
              conversationId: conversation.id,
              messageId: message.id,
              attachmentId: attachment.id,
              outcome: 'DENIED',
              failureCode: 'FORBIDDEN',
            },
            correlationId,
          },
        }).catch(() => undefined);
      }
      throw new AppError(404, 'CHAT_ATTACHMENT_NOT_FOUND', 'Anexo não encontrado ou não disponível para download.');
    }

    if (!storage) {
      throw new AppError(503, 'CHAT_STORAGE_UNAVAILABLE', 'Armazenamento privado de anexos não configurado.');
    }

    let fileExists;
    try {
      fileExists = await storage.exists(attachment.storagePath);
    } catch {
      throw new AppError(503, 'CHAT_STORAGE_UNAVAILABLE', 'Falha ao consultar armazenamento privado.');
    }

    if (!fileExists) {
      if (prisma.auditEvent?.create) {
        await prisma.auditEvent.create({
          data: {
            id: id(),
            actorId: actor.userId,
            entityType: 'ChatMessageAttachment',
            entityId: attachment.id,
            action: 'CHAT_ATTACHMENT_DOWNLOAD_UNAVAILABLE',
            afterJson: {
              taskId,
              conversationId: conversation.id,
              messageId: message.id,
              attachmentId: attachment.id,
              outcome: 'UNAVAILABLE',
              failureCode: 'FILE_NOT_FOUND',
            },
            correlationId,
          },
        }).catch(() => undefined);
      }
      throw new AppError(404, 'CHAT_ATTACHMENT_FILE_MISSING', 'O arquivo físico do anexo não foi encontrado no storage.');
    }

    let stream;
    try {
      stream = await storage.openReadStream(attachment.storagePath);
    } catch {
      throw new AppError(503, 'CHAT_STORAGE_UNAVAILABLE', 'Não foi possível abrir o arquivo para streaming.');
    }

    if (prisma.auditEvent?.create) {
      await prisma.auditEvent.create({
        data: {
          id: id(),
          actorId: actor.userId,
          entityType: 'ChatMessageAttachment',
          entityId: attachment.id,
          action: 'CHAT_ATTACHMENT_DOWNLOADED',
          afterJson: {
            taskId,
            conversationId: conversation.id,
            messageId: message.id,
            attachmentId: attachment.id,
            outcome: 'SUCCESS',
            sizeBytes: Number(attachment.sizeBytes),
            mimeType: attachment.mimeType,
          },
          correlationId,
        },
      }).catch(() => undefined);
    }

    return {
      stream,
      attachmentId: attachment.id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: Number(attachment.sizeBytes),
      taskId,
      conversationId: conversation.id,
      messageId: message.id,
    };
  };

  const recordDownloadStreamFailure = async (actor, downloadInfo, correlationId = randomUUID()) => {
    if (prisma?.auditEvent?.create && downloadInfo?.attachmentId) {
      await prisma.auditEvent.create({
        data: {
          id: id(),
          actorId: actor?.userId ?? null,
          entityType: 'ChatMessageAttachment',
          entityId: downloadInfo.attachmentId,
          action: 'CHAT_ATTACHMENT_DOWNLOAD_STREAM_FAILED',
          afterJson: {
            taskId: downloadInfo.taskId,
            conversationId: downloadInfo.conversationId,
            messageId: downloadInfo.messageId,
            attachmentId: downloadInfo.attachmentId,
            outcome: 'STREAM_FAILED',
            failureCode: 'STREAM_ABORTED',
          },
          correlationId,
        },
      }).catch(() => undefined);
    }
  };

  return {
    sendMessage,
    listMessages,
    advanceReadCursor,
    getAttachmentForDownload,
    recordDownloadStreamFailure,
  };
};
