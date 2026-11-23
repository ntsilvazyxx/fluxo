import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  uuidSchema,
  sequenceSchema,
  sendMessageSchema,
  addParticipantSchema,
  removeParticipantSchema,
  adminLockSchema,
  advanceReadCursorSchema,
  listMessagesQuerySchema,
  taskIdParamSchema,
  messageIdParamSchema,
  attachmentParamSchema,
  participantParamSchema,
} from '../../src/modules/chat/chat.schemas.js';

import {
  LOCK_REASONS,
  LOCK_EVENT_TYPES,
  getActiveParticipationPeriod,
  isParticipantActive,
  isTaskManager,
  canViewMetadata,
  canListParticipants,
  canReadMessageContent,
  canSendMessage,
  canManageParticipants,
  canInitializeConversation,
  canDownloadAttachment,
  canAdvanceReadCursor,
  canAdministerLock,
  evaluateLockRelease,
} from '../../src/modules/chat/chat.policy.js';

import {
  safeBigInt,
  safeNumber,
  presentAttachment,
  presentMessage,
  presentConversation,
  presentParticipant,
  presentLockState,
  presentLockEvent,
  presentReadReceipt,
  presentFunctionalReadState,
  presentPaginatedMessages,
} from '../../src/modules/chat/chat.presenter.js';

// ============================================================================
// 1. TESTES DE SCHEMAS ZOD E COMPATIBILIDADE DE UUIDs (chat.schemas.js)
// ============================================================================

describe('Chat Schemas e Validação de UUIDs (chat.schemas.js)', () => {
  const validUuidV4 = '2b041cb0-f931-4957-9a2a-ac6ea9a8b173';
  const validUuidV4Upper = '2B041CB0-F931-4957-9A2A-AC6EA9A8B173';
  const validUuidV1 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  const validUuidV7 = '018f6e70-6590-711b-8000-000000000000';
  const validUuid2 = 'e234841f-88d4-43c9-8b94-8b02455da9bf';

  describe('Compatibilidade de Versões de UUID (uuidSchema)', () => {
    it('deve aceitar UUID v4 canônico em minúsculas', () => {
      assert.equal(uuidSchema.safeParse(validUuidV4).success, true);
    });

    it('deve aceitar UUID v4 em maiúsculas', () => {
      assert.equal(uuidSchema.safeParse(validUuidV4Upper).success, true);
    });

    it('deve aceitar UUID v1 (baseado em tempo / nó)', () => {
      assert.equal(uuidSchema.safeParse(validUuidV1).success, true);
    });

    it('deve aceitar UUID v7 (baseado em timestamp Unix Epoch)', () => {
      assert.equal(uuidSchema.safeParse(validUuidV7).success, true);
    });

    it('deve rejeitar string com 36 caracteres arbitrária sem formatação UUID', () => {
      assert.equal(uuidSchema.safeParse('123456789012345678901234567890123456').success, false);
    });

    it('deve rejeitar identificadores com caracteres não hexadecimais', () => {
      assert.equal(uuidSchema.safeParse('zb041cb0-f931-4957-9a2a-ac6ea9a8b173').success, false);
    });

    it('deve rejeitar identificadores curtos ou arbitrários', () => {
      assert.equal(uuidSchema.safeParse('invalid-id').success, false);
      assert.equal(uuidSchema.safeParse('').success, false);
      assert.equal(uuidSchema.safeParse('12345').success, false);
    });
  });

  describe('sequenceSchema (Validação Flexível de Sequências e Cursores)', () => {
    it('deve aceitar inteiros não-negativos numéricos (0, valores comuns, MAX_SAFE_INTEGER)', () => {
      assert.equal(sequenceSchema.safeParse(0).success, true);
      assert.equal(sequenceSchema.safeParse(42).success, true);
      assert.equal(sequenceSchema.safeParse(Number.MAX_SAFE_INTEGER).success, true);
    });

    it('deve aceitar strings numéricas para valores além do limite seguro', () => {
      assert.equal(sequenceSchema.safeParse('0').success, true);
      assert.equal(sequenceSchema.safeParse('100').success, true);
      assert.equal(sequenceSchema.safeParse('9007199254740993').success, true);
    });

    it('deve rejeitar números negativos ou strings com letras', () => {
      assert.equal(sequenceSchema.safeParse(-1).success, false);
      assert.equal(sequenceSchema.safeParse('-50').success, false);
      assert.equal(sequenceSchema.safeParse('abc').success, false);
      assert.equal(sequenceSchema.safeParse('12.34').success, false);
    });
  });

  describe('sendMessageSchema', () => {
    it('deve aceitar payload válido com texto e clientMessageId (UUID v4)', () => {
      const payload = {
        clientMessageId: validUuidV4,
        content: 'Olá, esta é uma mensagem de teste.',
      };
      const result = sendMessageSchema.safeParse(payload);
      assert.equal(result.success, true);
      assert.equal(result.data.content, 'Olá, esta é uma mensagem de teste.');
      assert.deepEqual(result.data.stagedAttachmentIds, []);
    });

    it('deve aceitar clientMessageId com UUID v1 ou v7', () => {
      assert.equal(sendMessageSchema.safeParse({ clientMessageId: validUuidV1, content: 'Texto' }).success, true);
      assert.equal(sendMessageSchema.safeParse({ clientMessageId: validUuidV7, content: 'Texto' }).success, true);
    });

    it('deve aceitar payload com anexos e sem texto', () => {
      const payload = {
        clientMessageId: validUuidV4,
        stagedAttachmentIds: [validUuid2],
      };
      const result = sendMessageSchema.safeParse(payload);
      assert.equal(result.success, true);
      assert.equal(result.data.stagedAttachmentIds.length, 1);
    });

    it('deve aceitar payload com texto e anexos simultaneamente', () => {
      const payload = {
        clientMessageId: validUuidV4,
        content: 'Segue o relatório em anexo.',
        stagedAttachmentIds: [validUuid2],
      };
      const result = sendMessageSchema.safeParse(payload);
      assert.equal(result.success, true);
    });

    it('deve rejeitar payload vazio (sem texto e sem anexos)', () => {
      const payload = {
        clientMessageId: validUuidV4,
      };
      const result = sendMessageSchema.safeParse(payload);
      assert.equal(result.success, false);
      const errors = result.error.flatten().fieldErrors;
      assert.ok(errors.content, 'Esperado erro no campo content');
    });

    it('deve rejeitar payload com content vazio string ou apenas espaços', () => {
      const payload = {
        clientMessageId: validUuidV4,
        content: '   ',
        stagedAttachmentIds: [],
      };
      const result = sendMessageSchema.safeParse(payload);
      assert.equal(result.success, false);
    });

    it('deve rejeitar mais de 5 anexos', () => {
      const payload = {
        clientMessageId: validUuidV4,
        content: 'Muitos anexos',
        stagedAttachmentIds: [
          validUuidV4,
          validUuid2,
          validUuidV1,
          validUuidV7,
          '55555555-5555-4555-8555-555555555555',
          '66666666-6666-4666-8666-666666666666',
        ],
      };
      const result = sendMessageSchema.safeParse(payload);
      assert.equal(result.success, false);
    });

    it('deve rejeitar clientMessageId que não seja UUID', () => {
      const payload = {
        clientMessageId: 'id-invalido-nao-uuid',
        content: 'Texto',
      };
      const result = sendMessageSchema.safeParse(payload);
      assert.equal(result.success, false);
    });

    it('deve rejeitar campos desconhecidos (.strict())', () => {
      const payload = {
        clientMessageId: validUuidV4,
        content: 'Texto válido',
        campoInvasivo: 'hacker',
      };
      const result = sendMessageSchema.safeParse(payload);
      assert.equal(result.success, false);
    });

    it('deve rejeitar mensagens com mais de 10.000 caracteres', () => {
      const payload = {
        clientMessageId: validUuidV4,
        content: 'a'.repeat(10001),
      };
      const result = sendMessageSchema.safeParse(payload);
      assert.equal(result.success, false);
    });
  });

  describe('addParticipantSchema', () => {
    it('deve aceitar payload válido com userId UUID', () => {
      const result = addParticipantSchema.safeParse({ userId: validUuidV4 });
      assert.equal(result.success, true);
    });

    it('deve rejeitar userId que não seja UUID', () => {
      const result = addParticipantSchema.safeParse({ userId: 'nao-uuid' });
      assert.equal(result.success, false);
    });

    it('deve rejeitar campos extras (.strict())', () => {
      const result = addParticipantSchema.safeParse({ userId: validUuidV4, role: 'TECH' });
      assert.equal(result.success, false);
    });
  });

  describe('removeParticipantSchema', () => {
    it('deve aceitar motivo válido e aplicar default se omitido', () => {
      const withDefault = removeParticipantSchema.safeParse({});
      assert.equal(withDefault.success, true);
      assert.equal(withDefault.data.endReason, 'REMOVED_BY_MANAGER');

      const explicit = removeParticipantSchema.safeParse({ endReason: 'REASSIGNED' });
      assert.equal(explicit.success, true);
      assert.equal(explicit.data.endReason, 'REASSIGNED');
    });

    it('deve rejeitar motivo inválido', () => {
      const result = removeParticipantSchema.safeParse({ endReason: 'MOTIVO_INEXISTENTE' });
      assert.equal(result.success, false);
    });

    it('deve rejeitar campos extras (.strict())', () => {
      const result = removeParticipantSchema.safeParse({ endReason: 'CYCLE_ENDED', extra: true });
      assert.equal(result.success, false);
    });
  });

  describe('adminLockSchema', () => {
    it('deve aceitar bloqueio administrativo com justificativa válida', () => {
      const payload = {
        isLocked: true,
        reason: 'ADMIN_MAINTENANCE',
        justification: 'Manutenção técnica preventiva solicitada pela auditoria.',
      };
      const result = adminLockSchema.safeParse(payload);
      assert.equal(result.success, true);
      assert.equal(result.data.isLocked, true);
      assert.equal(result.data.reason, 'ADMIN_MAINTENANCE');
    });

    it('deve aceitar desbloqueio administrativo com justificativa', () => {
      const payload = {
        isLocked: false,
        justification: 'Concluída a averiguação da diretoria.',
      };
      const result = adminLockSchema.safeParse(payload);
      assert.equal(result.success, true);
      assert.equal(result.data.isLocked, false);
      assert.equal(result.data.reason, 'ADMIN_MAINTENANCE'); // default
    });

    it('deve rejeitar justificativa com menos de 5 caracteres', () => {
      const payload = {
        isLocked: true,
        justification: 'Ops',
      };
      const result = adminLockSchema.safeParse(payload);
      assert.equal(result.success, false);
    });

    it('deve rejeitar campos extras (.strict())', () => {
      const payload = {
        isLocked: true,
        justification: 'Justificativa válida.',
        unauthorizedField: 'tentativa',
      };
      const result = adminLockSchema.safeParse(payload);
      assert.equal(result.success, false);
    });
  });

  describe('advanceReadCursorSchema', () => {
    it('deve aceitar sequência não-negativa numérica e lastReadMessageId', () => {
      const result = advanceReadCursorSchema.safeParse({
        lastReadMessageId: validUuidV4,
        lastReadSequence: 42,
      });
      assert.equal(result.success, true);
      assert.equal(result.data.lastReadSequence, 42);
    });

    it('deve aceitar sequência 0', () => {
      const result = advanceReadCursorSchema.safeParse({
        lastReadSequence: 0,
      });
      assert.equal(result.success, true);
    });

    it('deve aceitar sequência como string numérica de valor superior ao limite seguro', () => {
      const result = advanceReadCursorSchema.safeParse({
        lastReadMessageId: validUuidV4,
        lastReadSequence: '9007199254740993',
      });
      assert.equal(result.success, true);
      assert.equal(result.data.lastReadSequence, '9007199254740993');
    });

    it('deve rejeitar sequência negativa', () => {
      const result = advanceReadCursorSchema.safeParse({
        lastReadSequence: -1,
      });
      assert.equal(result.success, false);
    });

    it('deve rejeitar campos desconhecidos (.strict())', () => {
      const result = advanceReadCursorSchema.safeParse({
        lastReadSequence: 10,
        extra: 123,
      });
      assert.equal(result.success, false);
    });
  });

  describe('listMessagesQuerySchema', () => {
    it('deve aplicar defaults para limit e status', () => {
      const result = listMessagesQuerySchema.safeParse({});
      assert.equal(result.success, true);
      assert.equal(result.data.limit, 50);
      assert.equal(result.data.status, 'PUBLISHED');
    });

    it('deve aceitar query de busca e limites válidos com beforeSequence numérico ou string', () => {
      const resultNum = listMessagesQuerySchema.safeParse({
        limit: '25',
        q: 'termo de busca',
        beforeSequence: '100',
      });
      assert.equal(resultNum.success, true);
      assert.equal(resultNum.data.limit, 25);
      assert.equal(resultNum.data.beforeSequence, '100');

      const resultBig = listMessagesQuerySchema.safeParse({
        beforeSequence: '9007199254740993',
      });
      assert.equal(resultBig.success, true);
      assert.equal(resultBig.data.beforeSequence, '9007199254740993');
    });

    it('deve rejeitar limit maior que 100 ou menor que 1', () => {
      assert.equal(listMessagesQuerySchema.safeParse({ limit: 0 }).success, false);
      assert.equal(listMessagesQuerySchema.safeParse({ limit: 101 }).success, false);
    });
  });

  describe('Param Schemas', () => {
    it('taskIdParamSchema deve validar taskId UUID', () => {
      assert.equal(taskIdParamSchema.safeParse({ taskId: validUuidV4 }).success, true);
      assert.equal(taskIdParamSchema.safeParse({ taskId: 'nao-uuid' }).success, false);
      assert.equal(taskIdParamSchema.safeParse({ taskId: validUuidV4, extra: 1 }).success, false);
    });

    it('messageIdParamSchema deve validar taskId e messageId', () => {
      assert.equal(messageIdParamSchema.safeParse({ taskId: validUuidV4, messageId: validUuid2 }).success, true);
      assert.equal(messageIdParamSchema.safeParse({ taskId: validUuidV4, messageId: 'invalido' }).success, false);
    });

    it('attachmentParamSchema deve validar taskId, messageId e attachmentId', () => {
      assert.equal(attachmentParamSchema.safeParse({
        taskId: validUuidV4,
        messageId: validUuid2,
        attachmentId: validUuidV1,
      }).success, true);
    });

    it('participantParamSchema deve validar taskId e participantId', () => {
      assert.equal(participantParamSchema.safeParse({ taskId: validUuidV4, participantId: validUuid2 }).success, true);
    });
  });
});

// ============================================================================
// 2. TESTES DE POLÍTICAS E RBAC (chat.policy.js)
// ============================================================================

describe('Chat Policy & RBAC (chat.policy.js)', () => {
  const actorMaster = { userId: 'u-master', roleCode: 'ADMIN_MASTER' };
  const actorSecretary = { userId: 'u-sec', roleCode: 'SECRETARY' };
  const actorManager = { userId: 'u-mgr-teamA', roleCode: 'MANAGER' };
  const actorTechActive = { userId: 'u-tech-1', roleCode: 'TECH' };
  const actorTechRemoved = { userId: 'u-tech-2', roleCode: 'TECH' };
  const actorExternal = { userId: 'u-tech-foreign', roleCode: 'TECH' };

  const task = {
    id: 'task-101',
    teamId: 'team-A',
    currentCycleId: 'cycle-101',
    team: {
      id: 'team-A',
      managers: [{ userId: 'u-mgr-teamA', endedAt: null }],
    },
  };

  const conversation = {
    id: 'conv-101',
    taskId: 'task-101',
  };

  const participantActive = {
    id: 'part-1',
    userId: 'u-tech-1',
    periods: [
      { id: 'p-1', joinedAt: new Date('2026-11-20T10:00:00Z'), endedAt: null },
    ],
  };

  const participantRemoved = {
    id: 'part-2',
    userId: 'u-tech-2',
    periods: [
      {
        id: 'p-2',
        joinedAt: new Date('2026-11-20T10:00:00Z'),
        endedAt: new Date('2026-11-21T18:00:00Z'),
        endReason: 'REASSIGNED',
      },
    ],
  };

  const lockUnlocked = { isLocked: false };
  const lockActive = {
    isLocked: true,
    reason: LOCK_REASONS.REQUEST_PENDING,
    lockedAt: new Date('2026-11-22T12:00:00Z'),
  };

  describe('isParticipantActive e getActiveParticipationPeriod', () => {
    it('deve identificar participante com período ativo (endedAt === null)', () => {
      assert.equal(isParticipantActive(participantActive), true);
      const activePeriod = getActiveParticipationPeriod(participantActive);
      assert.ok(activePeriod);
      assert.equal(activePeriod.endedAt, null);
    });

    it('deve identificar participante com período encerrado (endedAt != null)', () => {
      assert.equal(isParticipantActive(participantRemoved), false);
      const activePeriod = getActiveParticipationPeriod(participantRemoved);
      assert.equal(activePeriod, null);
    });

    it('deve retornar falso/null para participante inválido ou sem períodos', () => {
      assert.equal(isParticipantActive(null), false);
      assert.equal(isParticipantActive({ periods: [] }), false);
      assert.equal(getActiveParticipationPeriod(null), null);
    });
  });

  describe('isTaskManager', () => {
    it('deve validar gestor ativo da equipe da tarefa', () => {
      assert.equal(isTaskManager(actorManager, task), true);
    });

    it('deve rejeitar usuário com papel não MANAGER', () => {
      assert.equal(isTaskManager(actorMaster, task), false);
      assert.equal(isTaskManager(actorTechActive, task), false);
    });

    it('deve rejeitar gestor de outra equipe', () => {
      const foreignManager = { userId: 'u-mgr-teamB', roleCode: 'MANAGER' };
      assert.equal(isTaskManager(foreignManager, task), false);
    });
  });

  describe('canViewMetadata e canListParticipants', () => {
    it('ADMIN_MASTER e SECRETARY podem visualizar metadados e listar participantes', () => {
      assert.equal(canViewMetadata(actorMaster, task, conversation, null), true);
      assert.equal(canViewMetadata(actorSecretary, task, conversation, null), true);
      assert.equal(canListParticipants(actorMaster, task, conversation, null), true);
    });

    it('Gestor da equipe pode visualizar metadados e listar participantes', () => {
      assert.equal(canViewMetadata(actorManager, task, conversation, null), true);
      assert.equal(canListParticipants(actorManager, task, conversation, null), true);
    });

    it('Técnico participante (ativo ou histórico) pode visualizar metadados', () => {
      assert.equal(canViewMetadata(actorTechActive, task, conversation, participantActive), true);
      assert.equal(canViewMetadata(actorTechRemoved, task, conversation, participantRemoved), true);
    });

    it('Usuário sem vínculo (outra equipe / sem participação) tem acesso negado', () => {
      assert.equal(canViewMetadata(actorExternal, task, conversation, null), false);
      assert.equal(canListParticipants(actorExternal, task, conversation, null), false);
    });
  });

  describe('canReadMessageContent (Privacidade e RBAC estrito)', () => {
    const msgDuringPeriod = {
      id: 'msg-during',
      createdAt: new Date('2026-11-20T14:00:00Z'),
    };
    const msgAfterPeriod = {
      id: 'msg-after',
      createdAt: new Date('2026-11-22T08:00:00Z'), // após 2026-11-21T18:00:00Z
    };
    const msgBeforePeriod = {
      id: 'msg-before',
      createdAt: new Date('2026-11-19T10:00:00Z'), // antes de 2026-11-20T10:00:00Z
    };

    it('Gestor da equipe possui acesso funcional irrestrito a todas as mensagens', () => {
      assert.equal(canReadMessageContent(actorManager, task, conversation, null, true, msgDuringPeriod), true);
      assert.equal(canReadMessageContent(actorManager, task, conversation, null, true, msgAfterPeriod), true);
      assert.equal(canReadMessageContent(actorManager, task, conversation, null, true, msgBeforePeriod), true);
    });

    it('ADMIN_MASTER e SECRETARY NÃO possuem leitura automática de conteúdo textual sem serem participantes', () => {
      assert.equal(canReadMessageContent(actorMaster, task, conversation, null, false, msgDuringPeriod), false);
      assert.equal(canReadMessageContent(actorSecretary, task, conversation, null, false, msgDuringPeriod), false);
    });

    it('Técnico com participação ativa pode ler mensagens durante seu período', () => {
      assert.equal(canReadMessageContent(actorTechActive, task, conversation, participantActive, false, msgDuringPeriod), true);
      assert.equal(canReadMessageContent(actorTechActive, task, conversation, participantActive, false, msgAfterPeriod), true);
    });

    it('Técnico removido PODE ler mensagens enviadas DURANTE seu período ativo', () => {
      assert.equal(canReadMessageContent(actorTechRemoved, task, conversation, participantRemoved, false, msgDuringPeriod), true);
    });

    it('Técnico removido tem ACESSO NEGADO a mensagens posteriores ao encerramento', () => {
      assert.equal(canReadMessageContent(actorTechRemoved, task, conversation, participantRemoved, false, msgAfterPeriod), false);
    });

    it('Técnico removido tem ACESSO NEGADO a mensagens anteriores à sua entrada', () => {
      assert.equal(canReadMessageContent(actorTechRemoved, task, conversation, participantRemoved, false, msgBeforePeriod), false);
    });

    it('Usuário sem qualquer participação tem acesso totalmente negado (negação por default)', () => {
      assert.equal(canReadMessageContent(actorExternal, task, conversation, null, false, msgDuringPeriod), false);
      assert.equal(canReadMessageContent(null, task, conversation, participantActive, false, msgDuringPeriod), false);
    });
  });

  describe('canSendMessage', () => {
    it('Técnico com participação ativa PODE enviar mensagens quando o chat está desbloqueado', () => {
      assert.equal(canSendMessage(actorTechActive, task, conversation, lockUnlocked, participantActive), true);
    });

    it('Técnico com participação ativa NÃO pode enviar mensagens se o chat estiver bloqueado', () => {
      assert.equal(canSendMessage(actorTechActive, task, conversation, lockActive, participantActive), false);
    });

    it('Técnico removido NÃO pode enviar mensagens mesmo com chat desbloqueado', () => {
      assert.equal(canSendMessage(actorTechRemoved, task, conversation, lockUnlocked, participantRemoved), false);
    });

    it('Gestor NÃO pode enviar mensagens diretamente a menos que seja participante formal ativo', () => {
      assert.equal(canSendMessage(actorManager, task, conversation, lockUnlocked, null), false);
      assert.equal(canSendMessage(actorManager, task, conversation, lockUnlocked, participantActive), true);
    });

    it('ADMIN_MASTER e SECRETARY NÃO podem enviar mensagens a menos que sejam participantes formais ativos', () => {
      assert.equal(canSendMessage(actorMaster, task, conversation, lockUnlocked, null), false);
      assert.equal(canSendMessage(actorSecretary, task, conversation, lockUnlocked, null), false);
    });
  });

  describe('canManageParticipants', () => {
    it('Gestor da equipe pode gerenciar participantes', () => {
      assert.equal(canManageParticipants(actorManager, task), true);
    });

    it('Secretário pode gerenciar participantes globalmente', () => {
      assert.equal(canManageParticipants(actorSecretary, task), true);
    });

    it('Admin Master e Técnico NÃO podem gerenciar participantes operacionais', () => {
      assert.equal(canManageParticipants(actorMaster, task), false);
      assert.equal(canManageParticipants(actorTechActive, task), false);
    });
  });

  describe('canInitializeConversation', () => {
    it('permite inicialização quando conversa não existe e tarefa tem cycleId (Gestor, Secretário, Admin Master)', () => {
      assert.equal(canInitializeConversation(actorManager, task, null), true);
      assert.equal(canInitializeConversation(actorSecretary, task, null), true);
      assert.equal(canInitializeConversation(actorMaster, task, null), true);
    });

    it('rejeita inicialização para Técnico', () => {
      assert.equal(canInitializeConversation(actorTechActive, task, null), false);
    });

    it('rejeita inicialização se a conversa já existe', () => {
      assert.equal(canInitializeConversation(actorManager, task, conversation), false);
    });

    it('rejeita inicialização se a tarefa não possui ciclo', () => {
      const taskWithoutCycle = { id: 'task-no-cycle', currentCycleId: null, team: task.team };
      assert.equal(canInitializeConversation(actorManager, taskWithoutCycle, null), false);
    });
  });

  describe('canDownloadAttachment', () => {
    const messageValid = { id: 'msg-1', createdAt: new Date('2026-11-20T12:00:00Z') };
    const messageAfter = { id: 'msg-2', createdAt: new Date('2026-11-22T10:00:00Z') };

    it('permite download para participante com leitura quando chat desbloqueado', () => {
      assert.equal(canDownloadAttachment(actorTechActive, task, conversation, lockUnlocked, participantActive, false, messageValid), true);
    });

    it('permite download para participantes com leitura mesmo quando chat está BLOQUEADO', () => {
      assert.equal(canDownloadAttachment(actorTechActive, task, conversation, lockActive, participantActive, false, messageValid), true);
      assert.equal(canDownloadAttachment(actorManager, task, conversation, lockActive, null, true, messageValid), true);
    });

    it('BLOQUEIA download para participante removido em mensagem posterior ao encerramento', () => {
      assert.equal(canDownloadAttachment(actorTechRemoved, task, conversation, lockUnlocked, participantRemoved, false, messageAfter), false);
    });

    it('BLOQUEIA download para usuário sem permissão de leitura', () => {
      assert.equal(canDownloadAttachment(actorExternal, task, conversation, lockUnlocked, null, false, messageValid), false);
    });
  });

  describe('canAdvanceReadCursor', () => {
    it('permite participante formal e gestor avançarem cursor', () => {
      assert.equal(canAdvanceReadCursor(actorTechActive, task, participantActive, false), true);
      assert.equal(canAdvanceReadCursor(actorManager, task, null, true), true);
    });

    it('bloqueia usuário sem vínculo', () => {
      assert.equal(canAdvanceReadCursor(actorExternal, task, null, false), false);
    });
  });

  describe('canAdministerLock', () => {
    it('permite exclusivamente ADMIN_MASTER e SECRETARY', () => {
      assert.equal(canAdministerLock(actorMaster), true);
      assert.equal(canAdministerLock(actorSecretary), true);
      assert.equal(canAdministerLock(actorManager), false);
      assert.equal(canAdministerLock(actorTechActive), false);
    });
  });

  describe('evaluateLockRelease (Precedência Estrita de Bloqueios)', () => {
    it('ADMIN_MAINTENANCE só é liberado por ADMIN_INTERVENTION', () => {
      const lock = { isLocked: true, reason: LOCK_REASONS.ADMIN_MAINTENANCE };
      assert.equal(evaluateLockRelease(lock, LOCK_EVENT_TYPES.ADMIN_INTERVENTION), true);
      assert.equal(evaluateLockRelease(lock, LOCK_EVENT_TYPES.LOCK_RELEASED), false);
      assert.equal(evaluateLockRelease(lock, LOCK_EVENT_TYPES.CYCLE_REOPENED), false);
      assert.equal(evaluateLockRelease(lock, LOCK_EVENT_TYPES.DECISION_RECORDED_WHILE_UNLOCKED), false);
    });

    it('CYCLE_CLOSED só é liberado por CYCLE_REOPENED', () => {
      const lock = { isLocked: true, reason: LOCK_REASONS.CYCLE_CLOSED };
      assert.equal(evaluateLockRelease(lock, LOCK_EVENT_TYPES.CYCLE_REOPENED), true);
      assert.equal(evaluateLockRelease(lock, LOCK_EVENT_TYPES.LOCK_RELEASED), false);
      assert.equal(evaluateLockRelease(lock, LOCK_EVENT_TYPES.DECISION_RECORDED_WHILE_UNLOCKED), false);
    });

    it('REQUEST_PENDING é liberado por decisão de solicitação e também por reabertura ou admin', () => {
      const lock = { isLocked: true, reason: LOCK_REASONS.REQUEST_PENDING };
      assert.equal(evaluateLockRelease(lock, LOCK_EVENT_TYPES.LOCK_RELEASED), true);
      assert.equal(evaluateLockRelease(lock, LOCK_EVENT_TYPES.DECISION_RECORDED_WHILE_UNLOCKED), true);
      assert.equal(evaluateLockRelease(lock, LOCK_EVENT_TYPES.CYCLE_REOPENED), true);
      assert.equal(evaluateLockRelease(lock, LOCK_EVENT_TYPES.ADMIN_INTERVENTION), true);
    });

    it('se já está desbloqueado, sempre retorna true', () => {
      assert.equal(evaluateLockRelease({ isLocked: false }, LOCK_EVENT_TYPES.LOCK_RELEASED), true);
    });
  });
});

// ============================================================================
// 3. TESTES DE SERIALIZAÇÃO DE BIGINT E PRESENTERS (chat.presenter.js)
// ============================================================================

describe('Serialização Segura de BigInt e Presenters (chat.presenter.js)', () => {
  describe('safeBigInt e Preservação de Precisão', () => {
    it('deve serializar Zero como number (0n -> 0, 0 -> 0)', () => {
      assert.equal(safeBigInt(0n), 0);
      assert.equal(typeof safeBigInt(0n), 'number');
      assert.equal(safeBigInt(0), 0);
      assert.equal(typeof safeBigInt(0), 'number');
    });

    it('deve serializar valores comuns como number (42n -> 42, 1048576n -> 1048576)', () => {
      assert.equal(safeBigInt(42n), 42);
      assert.equal(typeof safeBigInt(42n), 'number');
      assert.equal(safeBigInt(1048576n), 1048576);
      assert.equal(typeof safeBigInt(1048576n), 'number');
    });

    it('deve serializar Number.MAX_SAFE_INTEGER exatamente como number', () => {
      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER); // 9007199254740991n
      const res = safeBigInt(maxSafe);
      assert.equal(res, Number.MAX_SAFE_INTEGER);
      assert.equal(typeof res, 'number');
    });

    it('NÃO deve perder precisão para valores superiores ao limite seguro (deve retornar String)', () => {
      const beyondSafe1 = BigInt(Number.MAX_SAFE_INTEGER) + 1n; // 9007199254740992n
      const beyondSafe2 = BigInt(Number.MAX_SAFE_INTEGER) + 2n; // 9007199254740993n

      const res1 = safeBigInt(beyondSafe1);
      assert.equal(res1, '9007199254740992');
      assert.equal(typeof res1, 'string', 'Valores acima de MAX_SAFE_INTEGER devem ser string para preservar precisão');

      const res2 = safeBigInt(beyondSafe2);
      assert.equal(res2, '9007199254740993');
      assert.equal(typeof res2, 'string');

      // Comprovar que Number(beyondSafe2) perderia precisão:
      assert.equal(Number(beyondSafe2), 9007199254740992); // Em JS puro, Number() arredonda 9007199254740993 para ...92
      assert.notEqual(res2, Number(beyondSafe2).toString(), 'safeBigInt preservou o 3 final que Number() perderia!');
    });

    it('deve converter strings numéricas de grande magnitude sem perda', () => {
      const res = safeBigInt('9007199254740993');
      assert.equal(res, '9007199254740993');
      assert.equal(typeof res, 'string');
    });

    it('deve retornar 0 para valores nulos, indefinidos ou negativos inválidos', () => {
      assert.equal(safeBigInt(null), 0);
      assert.equal(safeBigInt(undefined), 0);
      assert.equal(safeBigInt(-1), 0);
    });

    it('safeNumber deve ser um alias para safeBigInt', () => {
      assert.equal(safeNumber, safeBigInt);
    });
  });

  describe('presentAttachment e Contrato de Download REST', () => {
    it('deve gerar a URL exata do contrato REST: GET /api/v1/tasks/:taskId/chat/messages/:messageId/attachments/:attachmentId/download', () => {
      const rawAttachment = {
        id: 'att-123',
        messageId: 'msg-456',
        originalName: 'relatorio.pdf',
        storagePath: 'c:\\fluxo\\storage\\chat\\2026\\11\\att-123.bin', // Caminho físico que DEVE ser ocultado!
        mimeType: 'application/pdf',
        sizeBytes: 1048576n,
        sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef',
        origin: 'UPLOAD',
        createdAt: new Date('2026-11-22T15:00:00Z'),
      };

      const dto = presentAttachment(rawAttachment, { taskId: 'task-888', messageId: 'msg-456' });

      // Validação estrita do contrato REST previsto
      assert.equal(dto.downloadUrl, '/api/v1/tasks/task-888/chat/messages/msg-456/attachments/att-123/download');

      // Ocultação estrita de storagePath
      assert.equal('storagePath' in dto, false, 'storagePath NUNCA deve ser exposto no DTO');
      assert.equal(dto.storagePath, undefined);

      // Verificação das propriedades seguras
      assert.equal(dto.id, 'att-123');
      assert.equal(dto.messageId, 'msg-456');
      assert.equal(dto.originalName, 'relatorio.pdf');
      assert.equal(dto.mimeType, 'application/pdf');
      assert.equal(dto.sizeBytes, 1048576);
      assert.equal(typeof dto.sizeBytes, 'number');
      assert.equal(dto.sha256, rawAttachment.sha256);
      assert.equal(dto.origin, 'UPLOAD');

      // Serialização JSON limpa
      const json = JSON.stringify(dto);
      assert.ok(json.includes('relatorio.pdf'));
      assert.ok(!json.includes('c:\\\\fluxo'));
      assert.ok(!json.includes('storagePath'));
    });

    it('deve preservar tamanho exato em string se sizeBytes for astronômico (> MAX_SAFE_INTEGER)', () => {
      const rawAttachment = {
        id: 'att-large',
        messageId: 'msg-456',
        originalName: 'bigdata.tar',
        storagePath: '/secret/path',
        mimeType: 'application/x-tar',
        sizeBytes: 9007199254740995n, // Excede MAX_SAFE_INTEGER
        sha256: 'deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
        origin: 'UPLOAD',
        createdAt: new Date(),
      };

      const dto = presentAttachment(rawAttachment, { taskId: 'task-888' });
      assert.equal(dto.sizeBytes, '9007199254740995');
      assert.equal(typeof dto.sizeBytes, 'string');
    });

    it('deve retornar null para anexo nulo', () => {
      assert.equal(presentAttachment(null), null);
    });
  });

  describe('presentMessage com Sequenciais BigInt e Propagação de Contexto', () => {
    it('deve ocultar tokens de reconciliação e propagar taskId/messageId aos anexos para a URL de download', () => {
      const rawMessage = {
        id: 'msg-1',
        conversationId: 'conv-1',
        cycleId: 'cycle-1',
        authorId: 'usr-1',
        author: {
          id: 'usr-1',
          name: 'João Técnico',
          emailNormalized: 'joao.tecnico@example.gov.br',
          role: { code: 'TECH' },
        },
        sequenceNumber: 15n, // BigInt comum
        clientMessageId: '2b041cb0-f931-4957-9a2a-ac6ea9a8b173',
        content: 'Atualização técnica da tarefa.',
        status: 'PUBLISHED',
        // Propriedades internas de reconciliação assíncrona
        reconciliationClaimToken: 'secret-claim-token-999',
        reconciliationClaimedAt: new Date(),
        reconciliationClaimExpiresAt: new Date(),
        reconciliationAttempts: 2,
        failureReason: null,
        createdAt: new Date('2026-11-22T14:30:00Z'),
        publishedAt: new Date('2026-11-22T14:30:01Z'),
        attachments: [
          {
            id: 'att-1',
            messageId: 'msg-1',
            originalName: 'diag.png',
            storagePath: '/var/storage/secret/path/diag.png',
            mimeType: 'image/png',
            sizeBytes: 2048n,
            sha256: 'deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
            origin: 'UPLOAD',
            createdAt: new Date('2026-11-22T14:30:00Z'),
          },
        ],
      };

      const dto = presentMessage(rawMessage, { taskId: 'task-100' });

      // Ocultação estrita de tokens internos
      assert.equal('reconciliationClaimToken' in dto, false);
      assert.equal('reconciliationClaimedAt' in dto, false);
      assert.equal('reconciliationClaimExpiresAt' in dto, false);
      assert.equal('reconciliationAttempts' in dto, false);

      // Verificação da conversão de sequenceNumber
      assert.equal(dto.sequenceNumber, 15);
      assert.equal(typeof dto.sequenceNumber, 'number');

      // Verificação dos campos públicos
      assert.equal(dto.id, 'msg-1');
      assert.equal(dto.content, 'Atualização técnica da tarefa.');
      assert.equal(dto.status, 'PUBLISHED');
      assert.equal(dto.author.name, 'João Técnico');
      assert.equal(dto.author.email, 'joao.tecnico@example.gov.br');
      assert.equal(dto.author.role, 'TECH');

      // Anexos aninhados: contrato REST de download herdou taskId e messageId!
      assert.equal(dto.attachments.length, 1);
      assert.equal(
        dto.attachments[0].downloadUrl,
        '/api/v1/tasks/task-100/chat/messages/msg-1/attachments/att-1/download'
      );
      assert.equal('storagePath' in dto.attachments[0], false);

      // Serialização JSON limpa
      const json = JSON.stringify(dto);
      assert.ok(!json.includes('secret-claim-token-999'));
      assert.ok(!json.includes('/var/storage'));
    });

    it('deve preservar precisão em string para sequenceNumber astronômico (> MAX_SAFE_INTEGER)', () => {
      const rawMessage = {
        id: 'msg-huge-seq',
        conversationId: 'conv-1',
        cycleId: 'cycle-1',
        authorId: 'usr-1',
        sequenceNumber: 9007199254740999n,
        clientMessageId: '2b041cb0-f931-4957-9a2a-ac6ea9a8b173',
        content: 'Mensagem com sequência enorme',
        status: 'PUBLISHED',
        createdAt: new Date(),
      };

      const dto = presentMessage(rawMessage, { taskId: 'task-100' });
      assert.equal(dto.sequenceNumber, '9007199254740999');
      assert.equal(typeof dto.sequenceNumber, 'string');
    });
  });

  describe('presentLockState', () => {
    it('deve formatar estado de bloqueio ativo e inativo', () => {
      const unlockedDto = presentLockState(null);
      assert.equal(unlockedDto.isLocked, false);
      assert.equal(unlockedDto.reason, null);

      const lockedDto = presentLockState({
        isLocked: true,
        reason: 'ADMIN_MAINTENANCE',
        requestId: null,
        lockedAt: new Date('2026-11-22T10:00:00Z'),
        lockedBy: { id: 'usr-admin', name: 'Administrador Geral' },
      });
      assert.equal(lockedDto.isLocked, true);
      assert.equal(lockedDto.reason, 'ADMIN_MAINTENANCE');
      assert.equal(lockedDto.lockedBy.name, 'Administrador Geral');
    });
  });

  describe('presentParticipant e presentParticipantPeriod', () => {
    it('deve formatar participante com períodos e identificar activePeriod', () => {
      const rawParticipant = {
        id: 'part-100',
        conversationId: 'conv-100',
        userId: 'usr-tech',
        user: {
          id: 'usr-tech',
          name: 'Maria Engenheira',
          emailNormalized: 'maria@example.gov.br',
          role: { code: 'TECH' },
        },
        periods: [
          {
            id: 'period-1',
            joinedAt: new Date('2026-11-01T08:00:00Z'),
            endedAt: new Date('2026-11-10T18:00:00Z'),
            endReason: 'REASSIGNED',
            addedById: 'usr-mgr',
            addedBy: { id: 'usr-mgr', name: 'Gestor Carlos' },
            removedById: 'usr-mgr',
            removedBy: { id: 'usr-mgr', name: 'Gestor Carlos' },
          },
          {
            id: 'period-2',
            joinedAt: new Date('2026-11-15T09:00:00Z'),
            endedAt: null,
            endReason: null,
            addedById: 'usr-mgr',
            addedBy: { id: 'usr-mgr', name: 'Gestor Carlos' },
            removedById: null,
            removedBy: null,
          },
        ],
        createdAt: new Date('2026-11-01T08:00:00Z'),
        updatedAt: new Date('2026-11-15T09:00:00Z'),
      };

      const dto = presentParticipant(rawParticipant);

      assert.equal(dto.id, 'part-100');
      assert.equal(dto.userId, 'usr-tech');
      assert.equal(dto.user.name, 'Maria Engenheira');
      assert.equal(dto.isActive, true);
      assert.ok(dto.activePeriod);
      assert.equal(dto.activePeriod.id, 'period-2');
      assert.equal(dto.activePeriod.isActive, true);
      assert.equal(dto.periods.length, 2);
      assert.equal(dto.periods[0].isActive, false);
      assert.equal(dto.periods[0].endReason, 'REASSIGNED');
    });
  });

  describe('presentConversation', () => {
    it('deve formatar a conversa agregando lockState e unreadCount e propagando taskId para lastMessage', () => {
      const rawConv = {
        id: 'conv-555',
        taskId: 'task-888',
        task: { id: 'task-888', publicNumber: 12345 },
        lockState: {
          isLocked: false,
          reason: null,
        },
        participants: [
          {
            id: 'part-1',
            userId: 'user-current',
            periods: [{ id: 'p-1', joinedAt: new Date(), endedAt: null }],
          },
        ],
        messages: [
          {
            id: 'msg-last',
            conversationId: 'conv-555',
            cycleId: 'cycle-1',
            authorId: 'user-current',
            sequenceNumber: 10n,
            clientMessageId: '2b041cb0-f931-4957-9a2a-ac6ea9a8b173',
            content: 'Última mensagem enviada.',
            status: 'PUBLISHED',
            createdAt: new Date(),
            attachments: [
              {
                id: 'att-conv',
                messageId: 'msg-last',
                originalName: 'foto.jpg',
                storagePath: '/disk/foto.jpg',
                mimeType: 'image/jpeg',
                sizeBytes: 5000n,
                sha256: 'deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
                origin: 'UPLOAD',
                createdAt: new Date(),
              },
            ],
          },
        ],
        createdAt: new Date('2026-11-20T10:00:00Z'),
        updatedAt: new Date('2026-11-22T16:00:00Z'),
      };

      const dto = presentConversation(rawConv, { currentUserId: 'user-current', unreadCount: 3 });

      assert.equal(dto.id, 'conv-555');
      assert.equal(dto.taskId, 'task-888');
      assert.equal(dto.task.publicNumber, '12345');
      assert.equal(dto.lockState.isLocked, false);
      assert.equal(dto.unreadCount, 3);
      assert.ok(dto.myParticipation);
      assert.equal(dto.myParticipation.userId, 'user-current');
      assert.ok(dto.lastMessage);
      assert.equal(dto.lastMessage.content, 'Última mensagem enviada.');
      assert.equal(
        dto.lastMessage.attachments[0].downloadUrl,
        '/api/v1/tasks/task-888/chat/messages/msg-last/attachments/att-conv/download'
      );

      // Serialização garantida
      const json = JSON.stringify(dto);
      assert.ok(json.includes('conv-555'));
    });
  });

  describe('Cursores de Leitura BigInt (presentReadReceipt e presentFunctionalReadState)', () => {
    it('presentReadReceipt deve converter lastReadSequence BigInt comum e astronômico', () => {
      const receiptCommon = {
        id: 'rcpt-1',
        conversationId: 'conv-1',
        participantId: 'part-1',
        lastReadMessageId: 'msg-10',
        lastReadSequence: 99n,
        lastReadAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const dtoCommon = presentReadReceipt(receiptCommon);
      assert.equal(dtoCommon.lastReadSequence, 99);
      assert.equal(typeof dtoCommon.lastReadSequence, 'number');

      const receiptLarge = {
        ...receiptCommon,
        lastReadSequence: 9007199254740994n,
      };
      const dtoLarge = presentReadReceipt(receiptLarge);
      assert.equal(dtoLarge.lastReadSequence, '9007199254740994');
      assert.equal(typeof dtoLarge.lastReadSequence, 'string');
    });

    it('presentFunctionalReadState deve converter lastReadSequence BigInt comum e astronômico', () => {
      const stateCommon = {
        id: 'func-1',
        conversationId: 'conv-1',
        userId: 'usr-mgr',
        lastReadMessageId: 'msg-10',
        lastReadSequence: 105n,
        lastReadAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const dtoCommon = presentFunctionalReadState(stateCommon);
      assert.equal(dtoCommon.lastReadSequence, 105);
      assert.equal(typeof dtoCommon.lastReadSequence, 'number');

      const stateLarge = {
        ...stateCommon,
        lastReadSequence: 9007199254740996n,
      };
      const dtoLarge = presentFunctionalReadState(stateLarge);
      assert.equal(dtoLarge.lastReadSequence, '9007199254740996');
      assert.equal(typeof dtoLarge.lastReadSequence, 'string');
    });

    it('presentLockEvent deve formatar evento de auditoria', () => {
      const event = {
        id: 'evt-1',
        conversationId: 'conv-1',
        cycleId: 'cycle-1',
        eventType: 'LOCK_ACQUIRED',
        actorId: 'usr-admin',
        actor: { id: 'usr-admin', name: 'Admin Central' },
        reason: 'ADMIN_MAINTENANCE',
        requestId: null,
        metadata: { info: 'Audit info' },
        createdAt: new Date(),
      };
      const dto = presentLockEvent(event);
      assert.equal(dto.id, 'evt-1');
      assert.equal(dto.eventType, 'LOCK_ACQUIRED');
      assert.equal(dto.actor.name, 'Admin Central');
    });

    it('presentPaginatedMessages deve encapsular itens e metadados de paginação', () => {
      const messages = [
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          cycleId: 'cycle-1',
          authorId: 'usr-1',
          sequenceNumber: 1n,
          clientMessageId: '2b041cb0-f931-4957-9a2a-ac6ea9a8b173',
          content: 'Msg 1',
          status: 'PUBLISHED',
          createdAt: new Date(),
        },
      ];
      const dto = presentPaginatedMessages(messages, { limit: 10, cursor: 5, hasMore: true, totalCount: 20 });
      assert.equal(dto.items.length, 1);
      assert.equal(dto.pagination.limit, 10);
      assert.equal(dto.pagination.cursor, 5);
      assert.equal(dto.pagination.hasMore, true);
      assert.equal(dto.pagination.totalCount, 20);
    });
  });
});
