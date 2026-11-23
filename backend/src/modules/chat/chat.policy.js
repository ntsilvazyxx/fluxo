export const LOCK_REASONS = Object.freeze({
  REQUEST_PENDING: 'REQUEST_PENDING',
  CYCLE_CLOSED: 'CYCLE_CLOSED',
  ADMIN_MAINTENANCE: 'ADMIN_MAINTENANCE',
});

export const LOCK_PRECEDENCE = Object.freeze({
  ADMIN_MAINTENANCE: 3,
  CYCLE_CLOSED: 2,
  REQUEST_PENDING: 1,
});

export const LOCK_EVENT_TYPES = Object.freeze({
  LOCK_ACQUIRED: 'LOCK_ACQUIRED',
  LOCK_REASSERTED: 'LOCK_REASSERTED',
  LOCK_RELEASED: 'LOCK_RELEASED',
  DECISION_RECORDED_WHILE_UNLOCKED: 'DECISION_RECORDED_WHILE_UNLOCKED',
  CYCLE_TERMINATED: 'CYCLE_TERMINATED',
  CYCLE_REOPENED: 'CYCLE_REOPENED',
  ADMIN_INTERVENTION: 'ADMIN_INTERVENTION',
});

/**
 * Retorna o período de participação ativo de um participante (aquele com endedAt === null), se houver.
 */
export function getActiveParticipationPeriod(participant) {
  if (!participant?.periods || !Array.isArray(participant.periods)) return null;
  return participant.periods.find((p) => p.endedAt === null) ?? null;
}

/**
 * Verifica se um usuário possui vínculo formal ativo na conversa.
 */
export function isParticipantActive(participant) {
  return Boolean(getActiveParticipationPeriod(participant));
}

/**
 * Verifica se um gestor é responsável pela equipe da tarefa.
 */
export function isTaskManager(actor, task) {
  if (actor?.roleCode !== 'MANAGER') return false;
  const managers = task?.team?.managers;
  if (!Array.isArray(managers)) return false;
  return managers.some((m) => m.userId === actor.userId && (m.endedAt === null || m.endedAt === undefined));
}

/**
 * 1. Visualização de Metadados da Conversa.
 * Permitido para Admin Master, Secretário, Gestor da Equipe e Participantes da tarefa.
 */
export function canViewMetadata(actor, task, conversation, participant, isManager = false) {
  if (!actor || !task) return false;
  if (['ADMIN_MASTER', 'SECRETARY'].includes(actor.roleCode)) return true;
  if (isManager || isTaskManager(actor, task)) return true;
  return Boolean(participant);
}

/**
 * 2. Listagem de Participantes Formais.
 */
export function canListParticipants(actor, task, conversation, participant, isManager = false) {
  return canViewMetadata(actor, task, conversation, participant, isManager);
}

/**
 * 3. Leitura do Conteúdo das Mensagens.
 *
 * REGRAS DE PRIVACIDADE E RBAC:
 * - Admin Master e Secretário: NÃO possuem leitura automática de conteúdo (apenas se forem participantes formais).
 * - Gestor da Equipe: Acesso funcional integral a todas as mensagens da tarefa da sua equipe.
 * - Técnico com participação ativa: Acesso a todas as mensagens do período em que participa.
 * - Técnico com participação encerrada: Acesso estritamente restrito às mensagens enviadas DURANTE seus períodos ativos.
 *   Mensagens posteriores ao encerramento de sua participação são INACESSÍVEIS.
 */
export function canReadMessageContent(actor, task, conversation, participant, isManager = false, message = null) {
  if (!actor || !task || !conversation) return false;

  // Gestor da equipe tem acesso funcional integral
  if (isManager || isTaskManager(actor, task)) return true;

  // Participante formal
  if (participant && participant.periods && Array.isArray(participant.periods)) {
    // Se nenhuma mensagem específica foi fornecida para conferência pontual,
    // o participante que tenha pelo menos um período de participação tem acesso à listagem (que aplicará os filtros de período).
    if (!message) {
      return participant.periods.length > 0;
    }

    // Quando uma mensagem específica é avaliada, ela deve ter sido criada dentro de pelo menos um período ativo ou histórico do participante.
    const msgTime = new Date(message.createdAt).getTime();
    return participant.periods.some((period) => {
      const joinTime = new Date(period.joinedAt).getTime();
      const endTime = period.endedAt ? new Date(period.endedAt).getTime() : Infinity;
      return msgTime >= joinTime && msgTime <= endTime;
    });
  }

  // Admin Master e Secretário: se não forem participantes formais, NÃO possuem leitura de conteúdo.
  return false;
}

/**
 * 4. Envio de Mensagens no Chat.
 *
 * REGRAS:
 * - Conversa deve existir.
 * - Chat deve estar DESBLOQUEADO (isLocked === false).
 * - O usuário DEVE ter um período de participação formal ATIVO (endedAt === null).
 * - Gestores, Secretários e Admin Master não podem enviar mensagens a menos que sejam participantes ativos.
 */
export function canSendMessage(actor, task, conversation, lockState, participant) {
  if (!actor || !task || !conversation) return false;
  if (lockState?.isLocked) return false;
  return isParticipantActive(participant);
}

/**
 * 5. Gestão de Participantes (Adicionar / Remover).
 * Permitido exclusivamente ao Secretário (gestão global) e ao Gestor da Equipe da tarefa.
 * Admin Master e Técnicos NÃO possuem permissão para gerenciar participantes operacionais.
 */
export function canManageParticipants(actor, task, isManager = false) {
  if (!actor || !task) return false;
  if (actor.roleCode === 'SECRETARY') return true;
  if (isManager || isTaskManager(actor, task)) return true;
  return false;
}

/**
 * 6. Inicialização de Conversas Legadas (POST /init).
 * Permitido se a conversa ainda não existir e a tarefa já possuir histórico de ciclo/encaminhamento.
 * Permitido a Admin Master (administração técnica), Secretário e Gestor da Equipe.
 */
export function canInitializeConversation(actor, task, conversation, isManager = false) {
  if (!actor || !task) return false;
  if (conversation) return false; // Já existe
  if (!task.currentCycleId) return false; // Tarefa nunca foi associada a um ciclo
  if (['ADMIN_MASTER', 'SECRETARY'].includes(actor.roleCode)) return true;
  if (isManager || isTaskManager(actor, task)) return true;
  return false;
}

/**
 * 7. Download de Anexos de Mensagens.
 *
 * REGRAS:
 * - Deve possuir autorização de leitura da mensagem correspondente.
 * - Chat deve estar DESBLOQUEADO. Durante bloqueios ativos, downloads de anexos históricos
 *   ficam temporariamente vedados.
 */
export function canDownloadAttachment(actor, task, conversation, lockState, participant, isManager = false, message = null) {
  if (lockState?.isLocked) return false;
  return canReadMessageContent(actor, task, conversation, participant, isManager, message);
}

/**
 * 8. Avanço de Cursor de Leitura.
 * Participantes formais gravam em chat_read_receipts; Gestores gravam em chat_functional_read_states.
 */
export function canAdvanceReadCursor(actor, task, participant, isManager = false) {
  if (!actor || !task) return false;
  return Boolean(participant) || isManager || isTaskManager(actor, task);
}

/**
 * 9. Consulta ao Trilho de Eventos de Bloqueio.
 */
export function canViewLockEvents(actor, task, isManager = false, participant = null) {
  return canViewMetadata(actor, task, null, participant, isManager);
}

/**
 * 10. Intervenção Administrativa de Bloqueio/Desbloqueio (POST /lock).
 * Exclusivo de Admin Master e Secretário.
 */
export function canAdministerLock(actor) {
  return ['ADMIN_MASTER', 'SECRETARY'].includes(actor?.roleCode);
}

/**
 * Avalia se um evento do sistema pode remover um bloqueio de chat existente,
 * respeitando a precedência estrita:
 * 1. ADMIN_MAINTENANCE: só pode ser liberado por intervenção administrativa (ADMIN_INTERVENTION).
 * 2. CYCLE_CLOSED: só pode ser liberado por reabertura de ciclo (CYCLE_REOPENED).
 * 3. REQUEST_PENDING: é liberado pela decisão de qualquer solicitação no ciclo.
 */
export function evaluateLockRelease(currentLock, triggeringEvent) {
  if (!currentLock?.isLocked) return true; // Já desbloqueado

  const currentReason = currentLock.reason;

  if (currentReason === LOCK_REASONS.ADMIN_MAINTENANCE) {
    return triggeringEvent === LOCK_EVENT_TYPES.ADMIN_INTERVENTION;
  }

  if (currentReason === LOCK_REASONS.CYCLE_CLOSED) {
    return triggeringEvent === LOCK_EVENT_TYPES.CYCLE_REOPENED;
  }

  if (currentReason === LOCK_REASONS.REQUEST_PENDING) {
    return (
      triggeringEvent === LOCK_EVENT_TYPES.LOCK_RELEASED ||
      triggeringEvent === LOCK_EVENT_TYPES.DECISION_RECORDED_WHILE_UNLOCKED ||
      triggeringEvent === LOCK_EVENT_TYPES.CYCLE_REOPENED ||
      triggeringEvent === LOCK_EVENT_TYPES.ADMIN_INTERVENTION
    );
  }

  return false;
}
