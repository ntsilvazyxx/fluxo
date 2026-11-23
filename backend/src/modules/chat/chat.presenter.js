/**
 * DTOs e Apresentadores Seguros do Módulo de Chat de Tarefas.
 *
 * Garante a formatação uniforme dos dados retornados para as APIs e o mascaramento/ocultação
 * estrita de dados sensíveis internos:
 *  - Omissão de caminhos físicos no sistema de arquivos (`storagePath`).
 *  - Omissão de claims e tokens de reconciliação assíncrona (`reconciliationClaimToken`, etc.).
 *  - Preservação de precisão na serialização de inteiros de 64 bits (`BigInt`).
 *  - Conformidade estrita com os contratos REST:
 *    GET /api/v1/tasks/:taskId/chat/messages/:messageId/attachments/:attachmentId/download
 */

/**
 * Converte de forma segura BigInt ou valor numérico para representação JSON serializável.
 * - Valores entre 0 e Number.MAX_SAFE_INTEGER são retornados como Number (ex: 0, 42, 1048576).
 * - Valores superiores a Number.MAX_SAFE_INTEGER são retornados como String para NÃO perder precisão.
 * @param {bigint|number|string|null|undefined} val
 * @returns {number|string}
 */
export const safeBigInt = (val) => {
  if (val === null || val === undefined) return 0;

  if (typeof val === 'bigint') {
    if (val >= 0n && val <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(val);
    }
    return val.toString();
  }

  if (typeof val === 'number') {
    if (Number.isSafeInteger(val) && val >= 0) {
      return val;
    }
    if (val < 0) return 0;
    return BigInt(Math.trunc(val)).toString();
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d+$/.test(trimmed)) {
      try {
        const b = BigInt(trimmed);
        if (b <= BigInt(Number.MAX_SAFE_INTEGER)) {
          return Number(b);
        }
        return b.toString();
      } catch {
        return 0;
      }
    }
  }

  return 0;
};

// Alias para compatibilidade retroativa
export const safeNumber = safeBigInt;

/**
 * Formata um participante em um período específico de participação.
 */
export const presentParticipantPeriod = (period) => {
  if (!period) return null;
  return {
    id: period.id,
    joinedAt: period.joinedAt,
    endedAt: period.endedAt ?? null,
    endReason: period.endReason ?? null,
    addedById: period.addedById,
    addedBy: period.addedBy
      ? { id: period.addedBy.id, name: period.addedBy.name }
      : (period.addedById ? { id: period.addedById } : null),
    removedById: period.removedById ?? null,
    removedBy: period.removedBy
      ? { id: period.removedBy.id, name: period.removedBy.name }
      : (period.removedById ? { id: period.removedById } : null),
    isActive: !period.endedAt,
  };
};

/**
 * Formata um anexo de mensagem sem expor storagePath ou caminhos internos.
 * Constrói a URL de download em estrita conformidade com o contrato REST:
 * GET /api/v1/tasks/:taskId/chat/messages/:messageId/attachments/:attachmentId/download
 */
export const presentAttachment = (attachment, context = {}) => {
  if (!attachment) return null;

  const taskId = context.taskId
    ?? attachment.taskId
    ?? attachment.message?.conversation?.taskId
    ?? attachment.message?.taskId
    ?? ':taskId';

  const messageId = attachment.messageId
    ?? context.messageId
    ?? attachment.message?.id
    ?? ':messageId';

  return {
    id: attachment.id,
    messageId: attachment.messageId ?? (messageId !== ':messageId' ? messageId : undefined),
    position: attachment.position ?? null,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: safeBigInt(attachment.sizeBytes),
    sha256: attachment.sha256,
    origin: attachment.origin,
    createdAt: attachment.createdAt,
    downloadUrl: `/api/v1/tasks/${taskId}/chat/messages/${messageId}/attachments/${attachment.id}/download`,
  };
};

/**
 * Formata uma mensagem individual, ocultando tokens internos de reconciliação.
 */
export const presentMessage = (message, context = {}) => {
  if (!message) return null;

  const taskId = context.taskId ?? message.conversation?.taskId ?? message.taskId;
  const msgContext = {
    ...context,
    taskId,
    messageId: message.id,
  };

  return {
    id: message.id,
    conversationId: message.conversationId,
    cycleId: message.cycleId,
    authorId: message.authorId,
    author: message.author
      ? {
          id: message.author.id,
          name: message.author.name,
          email: message.author.emailNormalized || message.author.email || null,
          role: message.author.role?.code || message.author.role || null,
        }
      : (message.authorId ? { id: message.authorId } : null),
    sequenceNumber: safeBigInt(message.sequenceNumber),
    clientMessageId: message.clientMessageId,
    content: message.content ?? null,
    status: message.status,
    failureReason: message.failureReason ?? null,
    createdAt: message.createdAt,
    publishedAt: message.publishedAt ?? null,
    attachments: Array.isArray(message.attachments)
      ? message.attachments.map((att) => presentAttachment(att, msgContext))
      : [],
    // Metadados de leitura se populados no contexto
    isReadByCurrentUser: typeof context.isReadByCurrentUser === 'boolean'
      ? context.isReadByCurrentUser
      : undefined,
  };
};

/**
 * Formata o estado de bloqueio da conversa.
 */
export const presentLockState = (lockState) => {
  if (!lockState) {
    return {
      isLocked: false,
      reason: null,
      requestId: null,
      lockedAt: null,
      lockedBy: null,
    };
  }

  return {
    isLocked: Boolean(lockState.isLocked),
    reason: lockState.reason ?? null,
    requestId: lockState.requestId ?? null,
    lockedAt: lockState.lockedAt ?? null,
    lockedBy: lockState.lockedBy
      ? { id: lockState.lockedBy.id, name: lockState.lockedBy.name }
      : (lockState.lockedById ? { id: lockState.lockedById } : null),
  };
};

/**
 * Formata um participante da conversa e seus períodos.
 */
export const presentParticipant = (participant) => {
  if (!participant) return null;

  const periods = Array.isArray(participant.periods)
    ? participant.periods.map(presentParticipantPeriod)
    : [];
  const activePeriod = periods.find((p) => p.isActive) ?? null;

  return {
    id: participant.id,
    conversationId: participant.conversationId,
    userId: participant.userId,
    user: participant.user
      ? {
          id: participant.user.id,
          name: participant.user.name,
          email: participant.user.emailNormalized || participant.user.email || null,
          role: participant.user.role?.code || participant.user.role || null,
        }
      : (participant.userId ? { id: participant.userId } : null),
    isActive: Boolean(activePeriod),
    activePeriod,
    periods,
    createdAt: participant.createdAt,
    updatedAt: participant.updatedAt,
  };
};

/**
 * Formata recibo de leitura do participante formal.
 */
export const presentReadReceipt = (receipt) => {
  if (!receipt) return null;
  return {
    id: receipt.id,
    conversationId: receipt.conversationId,
    participantId: receipt.participantId,
    lastReadMessageId: receipt.lastReadMessageId ?? null,
    lastReadSequence: safeBigInt(receipt.lastReadSequence),
    lastReadAt: receipt.lastReadAt ?? null,
    createdAt: receipt.createdAt,
    updatedAt: receipt.updatedAt,
  };
};

/**
 * Formata leitura funcional do gestor ou observador.
 */
export const presentFunctionalReadState = (state) => {
  if (!state) return null;
  return {
    id: state.id,
    conversationId: state.conversationId,
    userId: state.userId,
    lastReadMessageId: state.lastReadMessageId ?? null,
    lastReadSequence: safeBigInt(state.lastReadSequence),
    lastReadAt: state.lastReadAt ?? null,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
};

/**
 * Formata evento de auditoria de bloqueio/desbloqueio.
 */
export const presentLockEvent = (event) => {
  if (!event) return null;
  return {
    id: event.id,
    conversationId: event.conversationId,
    cycleId: event.cycleId,
    eventType: event.eventType,
    actorId: event.actorId ?? null,
    actor: event.actor
      ? { id: event.actor.id, name: event.actor.name }
      : (event.actorId ? { id: event.actorId } : null),
    reason: event.reason ?? null,
    requestId: event.requestId ?? null,
    metadata: event.metadata ?? null,
    createdAt: event.createdAt,
  };
};

/**
 * Formata a conversa com estado consolidado e seguro.
 */
export const presentConversation = (conversation, context = {}) => {
  if (!conversation) return null;

  const participants = Array.isArray(conversation.participants)
    ? conversation.participants.map(presentParticipant)
    : [];

  const myParticipation = context.currentUserId && participants.length > 0
    ? (participants.find((p) => p.userId === context.currentUserId) ?? null)
    : (context.myParticipation ? presentParticipant(context.myParticipation) : null);

  const lockState = presentLockState(conversation.lockState ?? context.lockState);

  const convContext = {
    ...context,
    taskId: context.taskId ?? conversation.taskId,
  };

  const lastMessage = conversation.messages && conversation.messages.length > 0
    ? presentMessage(conversation.messages[0], convContext)
    : (conversation.lastMessage ? presentMessage(conversation.lastMessage, convContext) : null);

  const unreadCount = typeof context.unreadCount === 'number'
    ? context.unreadCount
    : (typeof conversation.unreadCount === 'number' ? conversation.unreadCount : 0);

  return {
    id: conversation.id,
    taskId: conversation.taskId,
    task: conversation.task
      ? {
          id: conversation.task.id,
          publicNumber: String(conversation.task.publicNumber ?? ''),
        }
      : undefined,
    lockState,
    myParticipation,
    unreadCount,
    lastMessage,
    participantsCount: conversation._count?.participants ?? participants.length,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
};

/**
 * Formata lista paginada de mensagens.
 */
export const presentPaginatedMessages = (messages, pagination = {}, context = {}) => {
  const items = Array.isArray(messages) ? messages : [];
  return {
    items: items.map((m) => presentMessage(m, context)),
    pagination: {
      limit: pagination.limit ?? items.length,
      cursor: pagination.cursor ?? null,
      hasMore: Boolean(pagination.hasMore),
      totalCount: typeof pagination.totalCount === 'number' ? pagination.totalCount : items.length,
    },
  };
};
