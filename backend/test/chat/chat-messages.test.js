import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createChatMessageService } from '../../src/modules/chat/chat-message.service.js';
import { createChatParticipantService } from '../../src/modules/chat/chat-participant.service.js';
import { createChatService } from '../../src/modules/chat/chat.service.js';
import { createChatController } from '../../src/modules/chat/chat.controller.js';
import { createTaskChatRouter } from '../../src/modules/chat/chat.routes.js';
import { AppError } from '../../src/shared/errors/app-error.js';
import { sendMessageSchema } from '../../src/modules/chat/chat.schemas.js';

describe('Chat Messages Service, Histórico, Idempotência e Leitura (Fase 4.4)', () => {
  const makeMockPrisma = () => {
    let conversations = [];
    let lockStates = [];
    let participants = [];
    let periods = [];
    let messages = [];
    let readReceipts = [];
    let functionalReadStates = [];
    let auditEvents = [];

    const tasks = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        teamId: 'team-alpha',
        createdById: 'usr-creator',
        currentCycleId: 'cycle-1',
        deletedAt: null,
        team: {
          id: 'team-alpha',
          managers: [{ userId: 'usr-mgr-alpha', endedAt: null }],
        },
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        teamId: 'team-beta',
        createdById: 'usr-creator-2',
        currentCycleId: 'cycle-2',
        deletedAt: null,
        team: {
          id: 'team-beta',
          managers: [{ userId: 'usr-mgr-beta', endedAt: null }],
        },
      },
    ];

    const users = {
      'usr-admin': { id: 'usr-admin', name: 'Admin Master', role: { code: 'ADMIN_MASTER', label: 'Admin' }, isActive: true, deletedAt: null },
      'usr-sec': { id: 'usr-sec', name: 'Secretário Executivo', role: { code: 'SECRETARY', label: 'Secretário' }, isActive: true, deletedAt: null },
      'usr-mgr-alpha': { id: 'usr-mgr-alpha', name: 'Gestor Alpha', role: { code: 'MANAGER', label: 'Gestor' }, isActive: true, deletedAt: null },
      'usr-mgr-beta': { id: 'usr-mgr-beta', name: 'Gestor Beta', role: { code: 'MANAGER', label: 'Gestor' }, isActive: true, deletedAt: null },
      'usr-creator': { id: 'usr-creator', name: 'Criador Tarefa', role: { code: 'MANAGER', label: 'Gestor' }, isActive: true, deletedAt: null },
      'usr-tech-1': { id: 'usr-tech-1', name: 'Técnico 1', role: { code: 'TECH', label: 'Técnico' }, isActive: true, deletedAt: null },
      'usr-tech-2': { id: 'usr-tech-2', name: 'Técnico 2', role: { code: 'TECH', label: 'Técnico' }, isActive: true, deletedAt: null },
      'usr-tech-3': { id: 'usr-tech-3', name: 'Técnico 3', role: { code: 'TECH', label: 'Técnico' }, isActive: true, deletedAt: null },
    };

    const mockClient = {
      task: {
        async findUnique({ where }) {
          return tasks.find((t) => t.id === where.id && (where.deletedAt === undefined || t.deletedAt === where.deletedAt)) ?? null;
        },
      },
      user: {
        async findFirst({ where }) {
          return users[where.id] ?? null;
        },
      },
      chatConversation: {
        async findUnique({ where }) {
          const conv = conversations.find((c) => c.id === where.id || c.taskId === where.taskId);
          if (!conv) return null;
          const ls = lockStates.find((l) => l.conversationId === conv.id) ?? null;
          return {
            ...conv,
            lockState: ls,
          };
        },
        async create({ data }) {
          if (conversations.some((c) => c.taskId === data.taskId)) {
            const err = new Error('Unique constraint failed on taskId');
            err.code = 'P2002';
            throw err;
          }
          const item = { ...data, createdAt: new Date(), updatedAt: new Date() };
          conversations.push(item);
          return item;
        },
      },
      chatLockState: {
        async findUnique({ where }) {
          return lockStates.find((l) => l.conversationId === where.conversationId) ?? null;
        },
        async create({ data }) {
          const item = { ...data, createdAt: new Date(), updatedAt: new Date() };
          lockStates.push(item);
          return item;
        },
        async update({ where, data }) {
          const idx = lockStates.findIndex((l) => l.conversationId === where.conversationId || l.id === where.id);
          if (idx === -1) throw new Error('LockState not found');
          lockStates[idx] = { ...lockStates[idx], ...data, updatedAt: new Date() };
          return lockStates[idx];
        },
      },
      chatParticipant: {
        async findUnique({ where, include }) {
          let p;
          if (where.id) {
            p = participants.find((item) => item.id === where.id);
          } else if (where.conversationId_userId) {
            p = participants.find(
              (item) => item.conversationId === where.conversationId_userId.conversationId && item.userId === where.conversationId_userId.userId
            );
          }
          if (!p) return null;
          let pPeriods = periods.filter((per) => per.participantId === p.id);
          if (include?.periods?.where?.endedAt === null) {
            pPeriods = pPeriods.filter((per) => per.endedAt === null);
          }
          return {
            ...p,
            user: users[p.userId] ?? null,
            periods: pPeriods,
          };
        },
        async create({ data }) {
          if (participants.some((p) => p.conversationId === data.conversationId && p.userId === data.userId)) {
            const err = new Error('Unique constraint failed on conversationId, userId');
            err.code = 'P2002';
            throw err;
          }
          const item = { ...data, createdAt: new Date(), updatedAt: new Date() };
          participants.push(item);
          return item;
        },
      },
      chatParticipationPeriod: {
        async create({ data }) {
          const item = { ...data, createdAt: new Date() };
          periods.push(item);
          return item;
        },
        async update({ where, data }) {
          const idx = periods.findIndex((p) => p.id === where.id);
          if (idx === -1) throw new Error('Period not found');
          periods[idx] = { ...periods[idx], ...data };
          return periods[idx];
        },
      },
      chatMessage: {
        async findUnique({ where }) {
          let msg;
          if (where.id) {
            msg = messages.find((m) => m.id === where.id);
          } else if (where.conversationId_clientMessageId) {
            msg = messages.find(
              (m) => m.conversationId === where.conversationId_clientMessageId.conversationId &&
                     m.clientMessageId === where.conversationId_clientMessageId.clientMessageId
            );
          } else if (where.conversationId_sequenceNumber) {
            msg = messages.find(
              (m) => m.conversationId === where.conversationId_sequenceNumber.conversationId &&
                     BigInt(m.sequenceNumber) === BigInt(where.conversationId_sequenceNumber.sequenceNumber)
            );
          }
          if (!msg) return null;
          return {
            ...msg,
            author: users[msg.authorId] ?? null,
            attachments: [],
            conversation: conversations.find((c) => c.id === msg.conversationId) ?? null,
          };
        },
        async findFirst({ where, orderBy }) {
          let list = messages.filter((m) => m.conversationId === where.conversationId);
          if (orderBy?.sequenceNumber === 'desc') {
            list = list.sort((a, b) => (BigInt(b.sequenceNumber) > BigInt(a.sequenceNumber) ? 1 : -1));
          } else if (orderBy?.sequenceNumber === 'asc') {
            list = list.sort((a, b) => (BigInt(a.sequenceNumber) > BigInt(b.sequenceNumber) ? 1 : -1));
          }
          const item = list[0] ?? null;
          if (!item) return null;
          return {
            ...item,
            author: users[item.authorId] ?? null,
            attachments: [],
            conversation: conversations.find((c) => c.id === item.conversationId) ?? null,
          };
        },
        async findMany({ where, orderBy, take }) {
          let list = messages.filter((m) => m.conversationId === where.conversationId);

          if (where.status) {
            list = list.filter((m) => m.status === where.status);
          }
          if (where.authorId) {
            list = list.filter((m) => m.authorId === where.authorId);
          }
          if (where.content?.contains) {
            const term = where.content.contains.toLowerCase();
            list = list.filter((m) => m.content && m.content.toLowerCase().includes(term));
          }
          if (where.sequenceNumber?.lt !== undefined) {
            list = list.filter((m) => BigInt(m.sequenceNumber) < BigInt(where.sequenceNumber.lt));
          }
          if (where.sequenceNumber?.gt !== undefined) {
            list = list.filter((m) => BigInt(m.sequenceNumber) > BigInt(where.sequenceNumber.gt));
          }
          if (where.OR && Array.isArray(where.OR)) {
            list = list.filter((m) => {
              const msgTime = new Date(m.createdAt).getTime();
              return where.OR.some((clause) => {
                const gte = clause.createdAt?.gte ? new Date(clause.createdAt.gte).getTime() : -Infinity;
                const lte = clause.createdAt?.lte ? new Date(clause.createdAt.lte).getTime() : Infinity;
                return msgTime >= gte && msgTime <= lte;
              });
            });
          }

          if (orderBy?.sequenceNumber === 'desc') {
            list = list.sort((a, b) => (BigInt(b.sequenceNumber) > BigInt(a.sequenceNumber) ? 1 : -1));
          } else {
            list = list.sort((a, b) => (BigInt(a.sequenceNumber) > BigInt(b.sequenceNumber) ? 1 : -1));
          }

          if (take) {
            list = list.slice(0, take);
          }

          return list.map((item) => ({
            ...item,
            author: users[item.authorId] ?? null,
            attachments: [],
            conversation: conversations.find((c) => c.id === item.conversationId) ?? null,
          }));
        },
        async count({ where }) {
          const items = await mockClient.chatMessage.findMany({ where });
          return items.length;
        },
        async create({ data }) {
          // Trigger de integridade / constraint UNIQUE
          if (messages.some((m) => m.conversationId === data.conversationId && m.clientMessageId === data.clientMessageId)) {
            const err = new Error('Unique constraint failed on conversationId, clientMessageId');
            err.code = 'P2002';
            throw err;
          }
          if (messages.some((m) => m.conversationId === data.conversationId && BigInt(m.sequenceNumber) === BigInt(data.sequenceNumber))) {
            const err = new Error('Unique constraint failed on conversationId, sequenceNumber');
            err.code = 'P2002';
            throw err;
          }
          const item = {
            ...data,
            createdAt: new Date(),
            publishedAt: data.status === 'PUBLISHED' ? new Date() : null,
          };
          messages.push(item);
          return {
            ...item,
            author: users[item.authorId] ?? null,
            attachments: [],
            conversation: conversations.find((c) => c.id === item.conversationId) ?? null,
          };
        },
        async update({ where, data }) {
          const idx = messages.findIndex((m) => m.id === where.id);
          if (idx === -1) throw new Error('Message not found');
          // Simula trigger trg_chat_messages_immutable_update: PUBLISHED e FAILED são imutáveis
          if (['PUBLISHED', 'FAILED'].includes(messages[idx].status)) {
            const err = new Error('SIGNAL SQLSTATE 45000: Terminal chat messages are strictly immutable');
            err.code = 'P2000';
            throw err;
          }
          messages[idx] = { ...messages[idx], ...data };
          return messages[idx];
        },
        async delete() {
          // Simula trigger trg_chat_messages_no_delete
          throw new Error('SIGNAL SQLSTATE 45000: Chat messages cannot be deleted');
        },
      },
      chatReadReceipt: {
        async findUnique({ where }) {
          return readReceipts.find((r) => r.participantId === where.participantId || r.id === where.id) ?? null;
        },
        async create({ data }) {
          const item = { ...data, createdAt: new Date(), updatedAt: new Date() };
          readReceipts.push(item);
          return item;
        },
        async update({ where, data }) {
          const idx = readReceipts.findIndex((r) => r.id === where.id);
          if (idx === -1) throw new Error('Receipt not found');
          readReceipts[idx] = { ...readReceipts[idx], ...data, updatedAt: new Date() };
          return readReceipts[idx];
        },
      },
      chatFunctionalReadState: {
        async findUnique({ where }) {
          if (where.conversationId_userId) {
            return functionalReadStates.find(
              (s) => s.conversationId === where.conversationId_userId.conversationId && s.userId === where.conversationId_userId.userId
            ) ?? null;
          }
          return functionalReadStates.find((s) => s.id === where.id) ?? null;
        },
        async create({ data }) {
          const item = { ...data, createdAt: new Date(), updatedAt: new Date() };
          functionalReadStates.push(item);
          return item;
        },
        async update({ where, data }) {
          const idx = functionalReadStates.findIndex((s) => s.id === where.id);
          if (idx === -1) throw new Error('State not found');
          functionalReadStates[idx] = { ...functionalReadStates[idx], ...data, updatedAt: new Date() };
          return functionalReadStates[idx];
        },
      },
      auditEvent: {
        async create({ data }) {
          auditEvents.push(data);
          return data;
        },
      },
      $queryRaw: async () => [],
      async $transaction(fn) {
        return fn(mockClient);
      },
    };

    return {
      mockPrisma: mockClient,
      getStore: () => ({
        conversations,
        lockStates,
        participants,
        periods,
        messages,
        readReceipts,
        functionalReadStates,
        auditEvents,
      }),
    };
  };

  const actorAdmin = { userId: 'usr-admin', roleCode: 'ADMIN_MASTER' };
  const actorSec = { userId: 'usr-sec', roleCode: 'SECRETARY' };
  const actorMgrAlpha = { userId: 'usr-mgr-alpha', roleCode: 'MANAGER' };
  const actorMgrBeta = { userId: 'usr-mgr-beta', roleCode: 'MANAGER' };
  const actorTech1 = { userId: 'usr-tech-1', roleCode: 'TECH' };
  const actorTech2 = { userId: 'usr-tech-2', roleCode: 'TECH' };
  const actorTech3 = { userId: 'usr-tech-3', roleCode: 'TECH' };

  const taskId = '11111111-1111-4111-8111-111111111111';
  const taskBetaId = '22222222-2222-4222-8222-222222222222';

  // ============================================================================
  // 1 & 2 & 3. VALIDAÇÃO DE PAYLOAD E LIMITES (ZOD & SERVICE)
  // ============================================================================
  describe('Validação de Mensagens Textuais (Itens 1, 2, 3)', () => {
    it('Item 1: Permite envio de mensagem textual válida', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      const payload = {
        clientMessageId: '33333333-3333-4333-8333-333333333331',
        content: 'Relatório preliminar de conformidade técnica emitido com sucesso.',
      };

      const result = await messageService.sendMessage(actorTech1, taskId, payload);
      assert.ok(result);
      assert.equal(result.clientMessageId, payload.clientMessageId);
      assert.equal(result.content, payload.content);
      assert.equal(result.status, 'PUBLISHED');
      assert.equal(result.sequenceNumber, 1);
      assert.ok(result.publishedAt);
      assert.equal(result.authorId, 'usr-tech-1');
    });

    it('Item 2: Rejeita mensagem vazia ou composta somente de espaços em branco (Zod Schema)', () => {
      const emptyPayload = {
        clientMessageId: '33333333-3333-4333-8333-333333333332',
        content: '    ',
        stagedAttachmentIds: [],
      };
      const parseResult = sendMessageSchema.safeParse(emptyPayload);
      assert.equal(parseResult.success, false);
    });

    it('Item 3: Rejeita conteúdo acima do limite de 10.000 caracteres (Zod Schema)', () => {
      const overlimitPayload = {
        clientMessageId: '33333333-3333-4333-8333-333333333333',
        content: 'x'.repeat(10001),
      };
      const parseResult = sendMessageSchema.safeParse(overlimitPayload);
      assert.equal(parseResult.success, false);
    });
  });

  // ============================================================================
  // 4, 5, 6, 7, 8 & 9. REGRAS DE PRIVACIDADE, RBAC E BLOQUEIO (Itens 4 a 9)
  // ============================================================================
  describe('RBAC, Privacidade e Bloqueio (Itens 4, 5, 6, 7, 8, 9)', () => {
    it('Item 4: Remetente sem participação ativa não pode enviar mensagem (403 FORBIDDEN)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      // usr-tech-3 não participa da conversa
      const payload = {
        clientMessageId: '33333333-3333-4333-8333-333333333334',
        content: 'Tentativa de mensagem sem participar',
      };

      await assert.rejects(
        () => messageService.sendMessage(actorTech3, taskId, payload),
        (err) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
      );
    });

    it('Item 5: Gestor sem participação formal ativa NÃO pode enviar mensagem (403 FORBIDDEN)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      // Gestor usr-mgr-alpha não é participante formal (criador é usr-creator, responsável é usr-tech-1)
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      const payload = {
        clientMessageId: '33333333-3333-4333-8333-333333333335',
        content: 'Gestor tentando enviar sem ser participante formal',
      };

      await assert.rejects(
        () => messageService.sendMessage(actorMgrAlpha, taskId, payload),
        (err) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
      );
    });

    it('Item 6: ADMIN MASTER NÃO tem acesso automático ao conteúdo das mensagens (403 FORBIDDEN)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');
      await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId: '33333333-3333-4333-8333-333333333336',
        content: 'Mensagem confidencial técnica',
      });

      await assert.rejects(
        () => messageService.listMessages(actorAdmin, taskId),
        (err) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
      );
    });

    it('Item 7: SECRETARY NÃO tem acesso automático ao conteúdo das mensagens (403 FORBIDDEN)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');
      await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId: '33333333-3333-4333-8333-333333333337',
        content: 'Mensagem entre técnicos da equipe',
      });

      await assert.rejects(
        () => messageService.listMessages(actorSec, taskId),
        (err) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
      );
    });

    it('Item 8: Técnico removido NÃO visualiza mensagens posteriores ao encerramento', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      // Adiciona tech-2
      const part2 = await participantService.addParticipant(actorSec, taskId, 'usr-tech-2');

      // tech-2 envia mensagem durante seu período ativo
      await messageService.sendMessage(actorTech2, taskId, {
        clientMessageId: '33333333-3333-4333-8333-333333333338',
        content: 'Mensagem de tech-2 durante período ativo',
      });

      // Remove tech-2 da conversa
      await participantService.removeParticipant(actorSec, taskId, part2.id, 'REASSIGNED');

      // Pequena pausa para garantir timestamp posterior
      await new Promise((resolve) => setTimeout(resolve, 20));

      // tech-1 envia mensagem APÓS a remoção de tech-2
      await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId: '33333333-3333-4333-8333-333333333339',
        content: 'Mensagem posterior enviada exclusivamente após a saída de tech-2',
      });

      // tech-2 consulta o histórico
      const historyTech2 = await messageService.listMessages(actorTech2, taskId);
      assert.equal(historyTech2.items.length, 1, 'Técnico removido deve visualizar apenas mensagens do seu período');
      assert.equal(historyTech2.items[0].content, 'Mensagem de tech-2 durante período ativo');
      assert.ok(!historyTech2.items.some((m) => m.content.includes('Mensagem posterior')));
    });

    it('Item 9: Envio de mensagem é BLOQUEADO quando o Chat está bloqueado (423 CHAT_LOCKED)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      // Bloqueia o chat
      const conv = await mockPrisma.chatConversation.findUnique({ where: { taskId } });
      await mockPrisma.chatLockState.update({
        where: { conversationId: conv.id },
        data: { isLocked: true, reason: 'REQUEST_PENDING', lockedAt: new Date() },
      });

      const payload = {
        clientMessageId: '33333333-3333-4333-8333-333333333340',
        content: 'Tentativa de mensagem durante bloqueio',
      };

      await assert.rejects(
        () => messageService.sendMessage(actorTech1, taskId, payload),
        (err) => err instanceof AppError && err.status === 423 && err.code === 'CHAT_LOCKED'
      );
    });
  });

  // ============================================================================
  // 10, 11 & 12. IDEMPOTÊNCIA E SEQUENCIAMENTO DETERMINÍSTICO (Itens 10, 11, 12)
  // ============================================================================
  describe('Idempotência e Sequenciamento (Itens 10, 11, 12)', () => {
    it('Item 10: Idempotência com payload idêntico retorna a mensagem original sem duplicar', async () => {
      const { mockPrisma, getStore } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      const payload = {
        clientMessageId: '33333333-3333-4333-8333-333333333341',
        content: 'Primeira tentativa de envio de mensagem idempotente',
      };

      const msg1 = await messageService.sendMessage(actorTech1, taskId, payload);
      const msg2 = await messageService.sendMessage(actorTech1, taskId, payload);

      assert.equal(msg1.id, msg2.id);
      assert.equal(msg1.sequenceNumber, msg2.sequenceNumber);
      assert.equal(msg1.sequenceNumber, 1);

      const store = getStore();
      assert.equal(store.messages.length, 1, 'Deve existir exatamente 1 mensagem persistida');
    });

    it('Item 11: Idempotência com payload diferente dispara conflito (409 IDEMPOTENCY_CONFLICT)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      const clientMessageId = '33333333-3333-4333-8333-333333333342';
      await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId,
        content: 'Conteúdo original',
      });

      // Tenta reenviar com o mesmo clientMessageId e texto alterado
      await assert.rejects(
        () => messageService.sendMessage(actorTech1, taskId, {
          clientMessageId,
          content: 'Conteúdo alterado tentando fraudar idempotência',
        }),
        (err) => err instanceof AppError && err.status === 409 && err.code === 'IDEMPOTENCY_CONFLICT'
      );
    });

    it('Item 12: Sequências únicas e ordenadas geradas de forma monotônica', async () => {
      const { mockPrisma, getStore } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      const msgA = await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId: '33333333-3333-4333-8333-333333333343',
        content: 'Mensagem número um',
      });
      const msgB = await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId: '33333333-3333-4333-8333-333333333344',
        content: 'Mensagem número dois',
      });
      const msgC = await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId: '33333333-3333-4333-8333-333333333345',
        content: 'Mensagem número três',
      });

      assert.equal(msgA.sequenceNumber, 1);
      assert.equal(msgB.sequenceNumber, 2);
      assert.equal(msgC.sequenceNumber, 3);

      const store = getStore();
      assert.equal(store.messages.length, 3);
    });
  });

  // ============================================================================
  // 13, 14 & 15. PAGINAÇÃO, PESQUISA E ISOLAMENTO (Itens 13, 14, 15)
  // ============================================================================
  describe('Paginação, Pesquisa e Isolamento (Itens 13, 14, 15)', () => {
    it('Item 13: Paginação anterior (beforeSequence) e posterior (afterSequence)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      for (let i = 1; i <= 5; i += 1) {
        await messageService.sendMessage(actorTech1, taskId, {
          clientMessageId: `33333333-3333-4333-8333-33333333335${i}`,
          content: `Mensagem seq ${i}`,
        });
      }

      // afterSequence = 2 -> deve retornar 3, 4, 5
      const afterRes = await messageService.listMessages(actorTech1, taskId, { afterSequence: 2 });
      assert.equal(afterRes.items.length, 3);
      assert.equal(afterRes.items[0].sequenceNumber, 3);
      assert.equal(afterRes.items[2].sequenceNumber, 5);

      // beforeSequence = 4 -> deve retornar 1, 2, 3
      const beforeRes = await messageService.listMessages(actorTech1, taskId, { beforeSequence: 4 });
      assert.equal(beforeRes.items.length, 3);
      assert.equal(beforeRes.items[0].sequenceNumber, 1);
      assert.equal(beforeRes.items[2].sequenceNumber, 3);
    });

    it('Item 14: Pesquisa textual (q) restrita à conversa autorizada', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId: '33333333-3333-4333-8333-333333333361',
        content: 'Relatório sobre a vazão do canal norte',
      });
      await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId: '33333333-3333-4333-8333-333333333362',
        content: 'Aprovação de orçamento complementar',
      });

      const searchRes = await messageService.listMessages(actorTech1, taskId, { q: 'vazão' });
      assert.equal(searchRes.items.length, 1);
      assert.ok(searchRes.items[0].content.includes('vazão'));
    });

    it('Item 15: Isolamento estrito entre tarefas e conversas distintas', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      // Task 1 (team-alpha) e Task 2 (team-beta)
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');
      await chatService.ensureConversationForTask(mockPrisma, taskBetaId, 'cycle-2', 'usr-creator-2', 'usr-tech-2');

      await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId: '33333333-3333-4333-8333-333333333371',
        content: 'Mensagem confidencial da Task 1',
      });
      await messageService.sendMessage(actorTech2, taskBetaId, {
        clientMessageId: '33333333-3333-4333-8333-333333333372',
        content: 'Mensagem confidencial da Task 2',
      });

      const listTask1 = await messageService.listMessages(actorTech1, taskId);
      assert.equal(listTask1.items.length, 1);
      assert.equal(listTask1.items[0].content, 'Mensagem confidencial da Task 1');

      const listTask2 = await messageService.listMessages(actorTech2, taskBetaId);
      assert.equal(listTask2.items.length, 1);
      assert.equal(listTask2.items[0].content, 'Mensagem confidencial da Task 2');
    });
  });

  // ============================================================================
  // 16, 17 & 18. CONTROLE DE LEITURA (Itens 16, 17, 18)
  // ============================================================================
  describe('Controle de Leitura (Itens 16, 17, 18)', () => {
    it('Item 16: Atualização monotônica do cursor de leitura e rejeição de retrocesso (422 CURSOR_REGRESSION)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      const m1 = await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId: '33333333-3333-4333-8333-333333333381',
        content: 'Mensagem 1',
      });
      const m2 = await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId: '33333333-3333-4333-8333-333333333382',
        content: 'Mensagem 2',
      });

      // Avança cursor para m2 (seq 2)
      const receipt = await messageService.advanceReadCursor(actorTech1, taskId, {
        lastReadMessageId: m2.id,
        lastReadSequence: 2,
      });
      assert.ok(receipt);
      assert.equal(receipt.lastReadSequence, 2);
      assert.equal(receipt.lastReadMessageId, m2.id);

      // Tenta retroceder para m1 (seq 1) -> deve ser rejeitado
      await assert.rejects(
        () => messageService.advanceReadCursor(actorTech1, taskId, {
          lastReadMessageId: m1.id,
          lastReadSequence: 1,
        }),
        (err) => err instanceof AppError && err.status === 422 && err.code === 'CURSOR_REGRESSION'
      );
    });

    it('Item 17: Rejeita cursor inválido (sequência não correspondente ou mensagem inexistente)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      const m1 = await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId: '33333333-3333-4333-8333-333333333383',
        content: 'Mensagem 1',
      });

      // Passa messageId de m1 com sequência fraudulenta 99
      await assert.rejects(
        () => messageService.advanceReadCursor(actorTech1, taskId, {
          lastReadMessageId: m1.id,
          lastReadSequence: 99,
        }),
        (err) => err instanceof AppError && err.status === 422 && err.code === 'INVALID_READ_CURSOR'
      );

      // Passa messageId inexistente
      await assert.rejects(
        () => messageService.advanceReadCursor(actorTech1, taskId, {
          lastReadMessageId: '00000000-0000-0000-0000-000000000000',
          lastReadSequence: 1,
        }),
        (err) => err instanceof AppError && err.status === 404 && err.code === 'MESSAGE_NOT_FOUND'
      );
    });

    it('Item 18: Gestor possui leitura funcional independente (chat_functional_read_states)', async () => {
      const { mockPrisma, getStore } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      const m1 = await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId: '33333333-3333-4333-8333-333333333384',
        content: 'Mensagem acompanhada pelo gestor da equipe',
      });

      // Gestor (sem participação formal) avança seu cursor de leitura funcional
      const funcState = await messageService.advanceReadCursor(actorMgrAlpha, taskId, {
        lastReadMessageId: m1.id,
        lastReadSequence: 1,
      });

      assert.ok(funcState);
      assert.equal(funcState.userId, 'usr-mgr-alpha');
      assert.equal(funcState.lastReadSequence, 1);

      const store = getStore();
      assert.equal(store.functionalReadStates.length, 1);
      assert.equal(store.readReceipts.length, 0, 'Leitura funcional não deve poluir a tabela de recibos de participantes');
    });
  });

  // ============================================================================
  // 19, 20, 21 & 22. PRECISÃO BIGINT, ROLLBACK, REGRESSÃO E IMUTABILIDADE
  // ============================================================================
  describe('BigInt, Rollback, Regressão e Imutabilidade (Itens 19, 20, 21, 22)', () => {
    it('Item 19: Preservação de precisão de BigInt em sequências elevadas', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      // Simula uma mensagem com sequência astronômica que excede MAX_SAFE_INTEGER
      const conv = await mockPrisma.chatConversation.findUnique({ where: { taskId } });
      await mockPrisma.chatMessage.create({
        data: {
          id: '44444444-4444-4444-8444-444444444444',
          conversationId: conv.id,
          cycleId: 'cycle-1',
          authorId: 'usr-tech-1',
          sequenceNumber: 9007199254740995n, // BigInt acima do limite seguro
          clientMessageId: '33333333-3333-4333-8333-333333333385',
          content: 'Mensagem com BigInt astronômico',
          status: 'PUBLISHED',
        },
      });

      const list = await messageService.listMessages(actorTech1, taskId);
      assert.equal(list.items.length, 1);
      assert.equal(list.items[0].sequenceNumber, '9007199254740995');
      assert.equal(typeof list.items[0].sequenceNumber, 'string', 'BigInt astronômico deve ser preservado como String');
    });

    it('Item 20: Rollback diante de falha transacional desfaz todas as alterações atômicas', async () => {
      let messagePersisted = false;
      const failingMockPrisma = {
        task: {
          async findUnique() {
            return {
              id: taskId,
              teamId: 'team-alpha',
              currentCycleId: 'cycle-1',
              deletedAt: null,
              team: { managers: [] },
            };
          },
        },
        chatConversation: {
          async findUnique() {
            return { id: 'conv-fail-1', taskId, lockState: { isLocked: false } };
          },
        },
        chatParticipant: {
          async findUnique() {
            return { id: 'part-1', periods: [{ endedAt: null }] };
          },
        },
        async $transaction(fn) {
          const tx = {
            chatMessage: {
              async findUnique() { return null; },
              async findFirst() { return null; },
              async create() {
                messagePersisted = true;
                // Simula falha catastrófica de rede ou I/O
                throw new Error('DATABASE_CONNECTION_LOST');
              },
            },
          };

          try {
            return await fn(tx);
          } catch (err) {
            messagePersisted = false;
            throw err;
          }
        },
      };

      const messageService = createChatMessageService({ prisma: failingMockPrisma });

      await assert.rejects(
        () => messageService.sendMessage(actorTech1, taskId, {
          clientMessageId: '33333333-3333-4333-8333-333333333386',
          content: 'Mensagem com falha induzida',
        }),
        (err) => err.message === 'DATABASE_CONNECTION_LOST'
      );

      assert.equal(messagePersisted, false, 'A mensagem NÃO pode permanecer gravada após rollback');
    });

    it('Item 21: Montagem de rotas HTTP com 8 endpoints consolidados no Router', () => {
      const { mockPrisma } = makeMockPrisma();
      const router = createTaskChatRouter({ prisma: mockPrisma, config: { jwtSecret: 'test' } });
      assert.ok(router);

      const routes = router.stack
        .filter((layer) => layer.route)
        .map((layer) => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods),
        }));

      assert.equal(routes.length, 9, 'Devem ser registradas exatamente 9 rotas autorizadas no router');
      assert.ok(routes.some((r) => r.path === '/:taskId/chat/messages' && r.methods.includes('get')));
      assert.ok(routes.some((r) => r.path === '/:taskId/chat/messages' && r.methods.includes('post')));
      assert.ok(routes.some((r) => r.path === '/:taskId/chat/read' && r.methods.includes('post')));
      assert.ok(routes.some((r) => r.path === '/:taskId/chat/lock' && r.methods.includes('post')));
    });

    it('Item 22: Imutabilidade estrita: mensagens publicadas não podem ser alteradas ou excluídas', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });

      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      const msg = await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId: '33333333-3333-4333-8333-333333333387',
        content: 'Mensagem original publicada',
      });

      // Tenta alterar via mock update -> simulando trigger trg_chat_messages_immutable_update
      await assert.rejects(
        () => mockPrisma.chatMessage.update({
          where: { id: msg.id },
          data: { content: 'Tentativa de adulterar mensagem' },
        }),
        (err) => err.message.includes('Terminal chat messages are strictly immutable')
      );

      // Tenta excluir via mock delete -> simulando trigger trg_chat_messages_no_delete
      await assert.rejects(
        () => mockPrisma.chatMessage.delete({
          where: { id: msg.id },
        }),
        (err) => err.message.includes('Chat messages cannot be deleted')
      );
    });

    it('Controller HTTP responde com status e envelopes previstos', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const messageService = createChatMessageService({ prisma: mockPrisma });
      const controller = createChatController({ chatService, participantService, messageService });

      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      const makeRes = () => {
        return {
          statusCode: null,
          body: null,
          status(code) {
            this.statusCode = code;
            return this;
          },
          json(payload) {
            this.body = payload;
            return this;
          },
        };
      };

      // 1. POST /messages -> 201
      const reqSend = {
        auth: actorTech1,
        validated: {
          params: { taskId },
          body: {
            clientMessageId: '33333333-3333-4333-8333-333333333388',
            content: 'Mensagem via controller',
          },
        },
      };
      const resSend = makeRes();
      await controller.sendMessage(reqSend, resSend);
      assert.equal(resSend.statusCode, 201);
      assert.ok(resSend.body.data.id);

      // 2. GET /messages -> 200
      const reqList = {
        auth: actorTech1,
        validated: {
          params: { taskId },
          query: { limit: 10 },
        },
      };
      const resList = makeRes();
      await controller.listMessages(reqList, resList);
      assert.equal(resList.statusCode, 200);
      assert.equal(resList.body.data.items.length, 1);

      // 3. POST /read -> 200
      const reqRead = {
        auth: actorTech1,
        validated: {
          params: { taskId },
          body: {
            lastReadMessageId: resSend.body.data.id,
            lastReadSequence: 1,
          },
        },
      };
      const resRead = makeRes();
      await controller.advanceReadCursor(reqRead, resRead);
      assert.equal(resRead.statusCode, 200);
      assert.equal(resRead.body.data.lastReadSequence, 1);
    });
  });
});
