import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createChatService } from '../../src/modules/chat/chat.service.js';
import { createChatParticipantService } from '../../src/modules/chat/chat-participant.service.js';
import { createChatController } from '../../src/modules/chat/chat.controller.js';
import { createTaskChatRouter } from '../../src/modules/chat/chat.routes.js';
import { AppError } from '../../src/shared/errors/app-error.js';

describe('Chat Services, Participantes e Rotas (Fase 4.3)', () => {
  const makeMockPrisma = () => {
    let conversations = [];
    let lockStates = [];
    let participants = [];
    let periods = [];
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
        currentCycle: {
          id: 'cycle-1',
          taskId: '11111111-1111-4111-8111-111111111111',
          cycleNumber: 1,
          status: 'IN_PROGRESS',
          assignments: [{ id: 'asgn-1', userId: 'usr-tech-1', endedAt: null }],
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
        currentCycle: {
          id: 'cycle-2',
          taskId: '22222222-2222-4222-8222-222222222222',
          cycleNumber: 1,
          status: 'AWAITING_ACCEPTANCE',
          assignments: [{ id: 'asgn-2', userId: 'usr-tech-2', endedAt: null }],
        },
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        teamId: 'team-alpha',
        createdById: 'usr-creator',
        currentCycleId: null, // Tarefa nunca encaminhada!
        deletedAt: null,
        team: {
          id: 'team-alpha',
          managers: [{ userId: 'usr-mgr-alpha', endedAt: null }],
        },
        currentCycle: null,
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
      'usr-tech-inactive': { id: 'usr-tech-inactive', name: 'Técnico Desativado', role: { code: 'TECH', label: 'Técnico' }, isActive: false, deletedAt: null },
    };

    const mockClient = {
      task: {
        async findUnique({ where }) {
          return tasks.find((t) => t.id === where.id) ?? null;
        },
        async findFirst({ where }) {
          return tasks.find((t) => t.id === where.id) ?? null;
        },
      },
      user: {
        async findFirst({ where }) {
          const user = users[where.id];
          if (!user) return null;
          if (where.isActive !== undefined && user.isActive !== where.isActive) return null;
          if (where.deletedAt !== undefined && user.deletedAt !== where.deletedAt) return null;
          return user;
        },
      },
      chatConversation: {
        async findUnique({ where }) {
          const conv = conversations.find((c) => c.id === where.id || c.taskId === where.taskId);
          if (!conv) return null;
          const ls = lockStates.find((l) => l.conversationId === conv.id) ?? null;
          const convParts = participants
            .filter((p) => p.conversationId === conv.id)
            .map((p) => ({
              ...p,
              user: users[p.userId] ?? null,
              periods: periods.filter((per) => per.participantId === p.id),
            }));
          return {
            ...conv,
            lockState: ls,
            task: tasks.find((t) => t.id === conv.taskId) ?? null,
            participants: convParts,
          };
        },
        async create({ data }) {
          // Simula constraint UNIQUE no banco MariaDB para taskId
          if (conversations.some((c) => c.taskId === data.taskId)) {
            const err = new Error('Unique constraint failed on the fields: (`taskId`)');
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
        async findMany({ where }) {
          let res = participants.filter((p) => p.conversationId === where.conversationId);
          return res.map((p) => ({
            ...p,
            user: users[p.userId] ?? null,
            periods: periods.filter((per) => per.participantId === p.id),
          }));
        },
        async create({ data }) {
          // Simula constraint UNIQUE no banco MariaDB para (conversationId, userId)
          if (participants.some((p) => p.conversationId === data.conversationId && p.userId === data.userId)) {
            const err = new Error('Unique constraint failed on the fields: (`conversationId`,`userId`)');
            err.code = 'P2002';
            throw err;
          }
          const item = { ...data, createdAt: new Date(), updatedAt: new Date() };
          participants.push(item);
          return {
            ...item,
            user: users[item.userId] ?? null,
            periods: [],
          };
        },
      },
      chatParticipationPeriod: {
        async create({ data }) {
          // Simula trigger de integridade: proíbe períodos ativos sobrepostos para o mesmo participante
          const existingActive = periods.find((p) => p.participantId === data.participantId && p.endedAt === null);
          if (existingActive) {
            const err = new Error('SIGNAL SQLSTATE 45000: overlapping active participation period');
            err.code = 'P2002';
            throw err;
          }
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
        auditEvents,
      }),
    };
  };

  const actorAdmin = { userId: 'usr-admin', roleCode: 'ADMIN_MASTER' };
  const actorSec = { userId: 'usr-sec', roleCode: 'SECRETARY' };
  const actorMgrAlpha = { userId: 'usr-mgr-alpha', roleCode: 'MANAGER' };
  const actorMgrBeta = { userId: 'usr-mgr-beta', roleCode: 'MANAGER' };
  const actorTech1 = { userId: 'usr-tech-1', roleCode: 'TECH' };
  const actorTech3 = { userId: 'usr-tech-3', roleCode: 'TECH' };

  describe('Criação no Primeiro Encaminhamento e Idempotência', () => {
    it('deve criar conversa vinculada à tarefa e incluir criador e responsável formalmente', async () => {
      const { mockPrisma, getStore } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      const cycleId = 'cycle-1';
      const creatorId = 'usr-creator';
      const responsibleId = 'usr-tech-1';

      const conv = await chatService.ensureConversationForTask(mockPrisma, taskId, cycleId, creatorId, responsibleId);
      assert.ok(conv);
      assert.equal(conv.taskId, taskId);

      const store = getStore();
      assert.equal(store.conversations.length, 1);
      assert.equal(store.lockStates.length, 1);
      assert.equal(store.lockStates[0].isLocked, false);
      assert.equal(store.lockStates[0].cycleId, cycleId);

      // Criador e primeiro responsável devem ser participantes
      assert.equal(store.participants.length, 2);
      const creatorPart = store.participants.find((p) => p.userId === creatorId);
      const respPart = store.participants.find((p) => p.userId === responsibleId);
      assert.ok(creatorPart);
      assert.ok(respPart);

      // Ambos devem ter período ativo (endedAt === null)
      const creatorPeriod = store.periods.find((p) => p.participantId === creatorPart.id);
      const respPeriod = store.periods.find((p) => p.participantId === respPart.id);
      assert.ok(creatorPeriod);
      assert.equal(creatorPeriod.endedAt, null);
      assert.ok(respPeriod);
      assert.equal(respPeriod.endedAt, null);
    });

    it('NÃO deve duplicar conversa se chamada novamente com a mesma tarefa (Idempotência)', async () => {
      const { mockPrisma, getStore } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      const store = getStore();
      assert.equal(store.conversations.length, 1, 'Deve existir exatamente 1 conversa para a tarefa');
      assert.equal(store.participants.length, 2);
      assert.equal(store.periods.length, 2);
    });
  });

  describe('Reatribuição de Tarefas', () => {
    it('deve incluir novo responsável e PRESERVAR o responsável anterior como participante ativo', async () => {
      const { mockPrisma, getStore } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      // Primeiro encaminhamento para tech-1
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      // Reatribuição para tech-2
      await chatService.handleTaskReassignment(mockPrisma, taskId, 'cycle-1', 'usr-mgr-alpha', 'usr-tech-2', 'usr-tech-1');

      const store = getStore();
      // Criador, tech-1 e tech-2
      assert.equal(store.participants.length, 3);

      const tech1Part = store.participants.find((p) => p.userId === 'usr-tech-1');
      const tech2Part = store.participants.find((p) => p.userId === 'usr-tech-2');
      assert.ok(tech1Part);
      assert.ok(tech2Part);

      // CRÍTICO: Responsável anterior permanece ATIVO (endedAt === null)
      const tech1Period = store.periods.find((p) => p.participantId === tech1Part.id);
      assert.ok(tech1Period);
      assert.equal(tech1Period.endedAt, null, 'O responsável anterior NÃO deve ter sua participação encerrada automaticamente na reatribuição');

      // Novo responsável também ativo
      const tech2Period = store.periods.find((p) => p.participantId === tech2Part.id);
      assert.ok(tech2Period);
      assert.equal(tech2Period.endedAt, null);
    });

    it('reatribuição para um técnico que já participa da conversa deve reutilizar sua participação ativa', async () => {
      const { mockPrisma, getStore } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      // Reatribui novamente para usr-tech-1
      await chatService.handleTaskReassignment(mockPrisma, taskId, 'cycle-1', 'usr-mgr-alpha', 'usr-tech-1', 'usr-tech-1');

      const store = getStore();
      const tech1Periods = store.periods.filter((p) => {
        const part = store.participants.find((pt) => pt.id === p.participantId);
        return part?.userId === 'usr-tech-1';
      });
      assert.equal(tech1Periods.length, 1, 'Não deve criar período duplicado');
    });
  });

  describe('Gestão Manual de Participantes (Adição, Remoção e Idempotência)', () => {
    it('Gestor da equipe pode adicionar participante manual', async () => {
      const { mockPrisma, getStore } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      const result = await participantService.addParticipant(actorMgrAlpha, taskId, 'usr-tech-3');
      assert.ok(result);
      assert.equal(result.userId, 'usr-tech-3');
      assert.equal(result.isActive, true);

      const store = getStore();
      assert.equal(store.participants.length, 3);
    });

    it('re-adicionar participante que já está ativo é idempotente e não duplica períodos', async () => {
      const { mockPrisma, getStore } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      await participantService.addParticipant(actorMgrAlpha, taskId, 'usr-tech-3');
      await participantService.addParticipant(actorMgrAlpha, taskId, 'usr-tech-3');

      const store = getStore();
      const tech3Part = store.participants.find((p) => p.userId === 'usr-tech-3');
      const tech3Periods = store.periods.filter((p) => p.participantId === tech3Part.id);
      assert.equal(tech3Periods.length, 1, 'Deve existir exatamente 1 período');
    });

    it('Gestor de outra equipe NÃO pode adicionar participante (RBAC 403)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111'; // team-alpha
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      await assert.rejects(
        () => participantService.addParticipant(actorMgrBeta, taskId, 'usr-tech-3'),
        (err) => err instanceof AppError && err.status === 403
      );
    });

    it('Técnico NÃO pode gerenciar participantes (RBAC 403)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      await assert.rejects(
        () => participantService.addParticipant(actorTech1, taskId, 'usr-tech-3'),
        (err) => err instanceof AppError && err.status === 403
      );
    });

    it('rejeita inclusão de usuário inexistente ou inativo (404)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      await assert.rejects(
        () => participantService.addParticipant(actorMgrAlpha, taskId, 'usr-tech-inactive'),
        (err) => err instanceof AppError && err.status === 404
      );
    });

    it('remoção explícita de participante encerra o período ativo sem excluir o histórico', async () => {
      const { mockPrisma, getStore } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');
      const added = await participantService.addParticipant(actorMgrAlpha, taskId, 'usr-tech-3');

      const removed = await participantService.removeParticipant(actorMgrAlpha, taskId, added.id, 'REMOVED_BY_MANAGER');
      assert.equal(removed.isActive, false);

      const store = getStore();
      const tech3Part = store.participants.find((p) => p.userId === 'usr-tech-3');
      assert.ok(tech3Part, 'Registro de participante deve ser preservado');

      const tech3Period = store.periods.find((p) => p.participantId === tech3Part.id);
      assert.ok(tech3Period);
      assert.ok(tech3Period.endedAt, 'endedAt deve estar preenchido');
      assert.equal(tech3Period.endReason, 'REMOVED_BY_MANAGER');
      assert.equal(tech3Period.removedById, 'usr-mgr-alpha');
    });

    it('rejeita remoção de participante já inativo (409 PARTICIPANT_ALREADY_INACTIVE)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');
      const added = await participantService.addParticipant(actorMgrAlpha, taskId, 'usr-tech-3');
      await participantService.removeParticipant(actorMgrAlpha, taskId, added.id, 'REMOVED_BY_MANAGER');

      await assert.rejects(
        () => participantService.removeParticipant(actorMgrAlpha, taskId, added.id, 'REMOVED_BY_MANAGER'),
        (err) => err instanceof AppError && err.status === 409 && err.code === 'PARTICIPANT_ALREADY_INACTIVE'
      );
    });

    it('rejeita remoção de participantId de outra tarefa (Proteção contra adulteração de IDs 404)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const task1 = '11111111-1111-4111-8111-111111111111';
      const task2 = '22222222-2222-4222-8222-222222222222';
      await chatService.ensureConversationForTask(mockPrisma, task1, 'cycle-1', 'usr-creator', 'usr-tech-1');
      await chatService.ensureConversationForTask(mockPrisma, task2, 'cycle-2', 'usr-creator-2', 'usr-tech-2');

      const partTask2 = (await participantService.listParticipants(actorSec, task2))[0];

      // Tenta remover na task1 passando participantId da task2
      await assert.rejects(
        () => participantService.removeParticipant(actorSec, task1, partTask2.id),
        (err) => err instanceof AppError && err.status === 404
      );
    });

    it('re-adicionar participante anteriormente removido abre novo período sem sobreposição', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      const added1 = await participantService.addParticipant(actorMgrAlpha, taskId, 'usr-tech-3');
      await participantService.removeParticipant(actorMgrAlpha, taskId, added1.id, 'REMOVED_BY_MANAGER');

      // Re-adiciona
      const added2 = await participantService.addParticipant(actorMgrAlpha, taskId, 'usr-tech-3');
      assert.equal(added2.isActive, true);
      assert.equal(added2.periods.length, 2);
      assert.equal(added2.periods[0].isActive, false);
      assert.equal(added2.periods[1].isActive, true);
    });
  });

  describe('Inicialização de Tarefas Legadas (POST /api/v1/tasks/:taskId/chat/init)', () => {
    it('permite que o Gestor ou Secretário inicialize o chat de uma tarefa legada que já foi encaminhada', async () => {
      const { mockPrisma, getStore } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      const result = await chatService.initLegacyConversation(actorMgrAlpha, taskId, 'Migração inicial de legado');
      assert.ok(result);
      assert.equal(result.taskId, taskId);
      assert.equal(result.lockState.isLocked, false);

      const store = getStore();
      assert.equal(store.conversations.length, 1);
      assert.equal(store.auditEvents.length, 1);
      assert.equal(store.auditEvents[0].action, 'CHAT_INITIALIZED_LEGACY');
    });

    it('rejeita inicialização se o chat já estiver criado (409 CHAT_ALREADY_INITIALIZED)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.initLegacyConversation(actorMgrAlpha, taskId, 'Primeira');

      await assert.rejects(
        () => chatService.initLegacyConversation(actorMgrAlpha, taskId, 'Segunda'),
        (err) => err instanceof AppError && err.status === 409 && err.code === 'CHAT_ALREADY_INITIALIZED'
      );
    });

    it('rejeita inicialização de tarefa que NUNCA foi encaminhada (422 TASK_NOT_FORWARDED)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskIdNeverForwarded = '33333333-3333-4333-8333-333333333333';

      await assert.rejects(
        () => chatService.initLegacyConversation(actorMgrAlpha, taskIdNeverForwarded, 'Tentativa'),
        (err) => err instanceof AppError && err.status === 422 && err.code === 'TASK_NOT_FORWARDED'
      );
    });

    it('Técnico não pode inicializar chat legado (RBAC 403)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';

      await assert.rejects(
        () => chatService.initLegacyConversation(actorTech1, taskId, 'Tentativa'),
        (err) => err instanceof AppError && err.status === 403
      );
    });
  });

  describe('Consulta de Metadados e Ausência de Efeitos Colaterais em GET', () => {
    it('getConversation retorna metadados para participantes sem modificar o banco', async () => {
      const { mockPrisma, getStore } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      const beforeStoreCount = getStore().conversations.length;
      const result = await chatService.getConversation(actorTech1, taskId);
      const afterStoreCount = getStore().conversations.length;

      assert.equal(beforeStoreCount, afterStoreCount, 'GET não deve alterar o banco');
      assert.equal(result.taskId, taskId);
      assert.equal(result.unreadCount, 0);
      assert.equal(result.lockState.isLocked, false);
      assert.ok(result.myParticipation);
      assert.equal(result.myParticipation.userId, 'usr-tech-1');
    });

    it('rejeita GET em tarefa com chat não inicializado (404 CHAT_NOT_INITIALIZED)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';

      await assert.rejects(
        () => chatService.getConversation(actorMgrAlpha, taskId),
        (err) => err instanceof AppError && err.status === 404 && err.code === 'CHAT_NOT_INITIALIZED'
      );
    });

    it('Técnico sem vínculo não pode consultar metadados da conversa (RBAC 403)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      await assert.rejects(
        () => chatService.getConversation(actorTech3, taskId),
        (err) => err instanceof AppError && err.status === 403
      );
    });

    it('listParticipants permite filtro activeOnly=true', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');
      const added = await participantService.addParticipant(actorMgrAlpha, taskId, 'usr-tech-3');
      await participantService.removeParticipant(actorMgrAlpha, taskId, added.id, 'REMOVED_BY_MANAGER');

      const all = await participantService.listParticipants(actorMgrAlpha, taskId, { activeOnly: false });
      assert.equal(all.length, 3);

      const activeOnly = await participantService.listParticipants(actorMgrAlpha, taskId, { activeOnly: true });
      assert.equal(activeOnly.length, 2);
      assert.ok(!activeOnly.some((p) => p.userId === 'usr-tech-3'));
    });
  });

  describe('Controller e Roteamento de Rotas do Chat', () => {
    it('createTaskChatRouter monta as rotas autorizadas com sucesso', () => {
      const { mockPrisma } = makeMockPrisma();
      const router = createTaskChatRouter({ prisma: mockPrisma, config: { jwtSecret: 'test' } });
      assert.ok(router);

      // Inspeciona rotas registradas na pilha do Router
      const routes = router.stack
        .filter((layer) => layer.route)
        .map((layer) => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods),
        }));

      assert.equal(routes.length, 10, 'Devem ser registradas exatamente as 10 rotas autorizadas no router');
      assert.ok(routes.some((r) => r.path === '/:taskId/chat' && r.methods.includes('get')));
      assert.ok(routes.some((r) => r.path === '/:taskId/chat/init' && r.methods.includes('post')));
      assert.ok(routes.some((r) => r.path === '/:taskId/chat/participants' && r.methods.includes('get')));
      assert.ok(routes.some((r) => r.path === '/:taskId/chat/participants' && r.methods.includes('post')));
      assert.ok(routes.some((r) => r.path === '/:taskId/chat/participants/:participantId' && r.methods.includes('delete')));
      assert.ok(routes.some((r) => r.path === '/:taskId/chat/messages' && r.methods.includes('get')));
      assert.ok(routes.some((r) => r.path === '/:taskId/chat/messages' && r.methods.includes('post')));
      assert.ok(routes.some((r) => r.path === '/:taskId/chat/messages/:messageId/attachments/:attachmentId/download' && r.methods.includes('get')));
      assert.ok(routes.some((r) => r.path === '/:taskId/chat/read' && r.methods.includes('post')));
      assert.ok(routes.some((r) => r.path === '/:taskId/chat/lock' && r.methods.includes('post')));
    });

    it('createChatController executa as ações e retorna status HTTP correspondentes', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });
      const controller = createChatController({ chatService, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';

      // Mock de request e response Express
      const makeRes = () => {
        const res = {
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
        return res;
      };

      // 1. initLegacyChat -> status 201
      const reqInit = {
        auth: actorMgrAlpha,
        validated: { params: { taskId }, body: { reason: 'Teste' } },
      };
      const resInit = makeRes();
      await controller.initLegacyChat(reqInit, resInit);
      assert.equal(resInit.statusCode, 201);
      assert.ok(resInit.body.data);

      // 2. getConversation -> status 200
      const reqGet = {
        auth: actorMgrAlpha,
        validated: { params: { taskId } },
      };
      const resGet = makeRes();
      await controller.getConversation(reqGet, resGet);
      assert.equal(resGet.statusCode, 200);
      assert.equal(resGet.body.data.taskId, taskId);

      // 3. addParticipant -> status 201
      const reqAdd = {
        auth: actorMgrAlpha,
        validated: { params: { taskId }, body: { userId: 'usr-tech-3' } },
      };
      const resAdd = makeRes();
      await controller.addParticipant(reqAdd, resAdd);
      assert.equal(resAdd.statusCode, 201);
      assert.equal(resAdd.body.data.userId, 'usr-tech-3');

      // 4. listParticipants -> status 200
      const reqList = {
        auth: actorMgrAlpha,
        validated: { params: { taskId }, query: {} },
      };
      const resList = makeRes();
      await controller.listParticipants(reqList, resList);
      assert.equal(resList.statusCode, 200);
      assert.equal(resList.body.data.length, 3);

      // 5. removeParticipant -> status 200
      const participantToRemove = resAdd.body.data.id;
      const reqDel = {
        auth: actorMgrAlpha,
        validated: { params: { taskId, participantId: participantToRemove }, body: { endReason: 'REMOVED_BY_MANAGER' } },
      };
      const resDel = makeRes();
      await controller.removeParticipant(reqDel, resDel);
      assert.equal(resDel.statusCode, 200);
      assert.equal(resDel.body.data.isActive, false);
    });
  });

  describe('Auditoria de RBAC Estrito (Fase 4.3.1)', () => {
    it('ADMIN_MASTER NÃO pode adicionar participante operacional (403 FORBIDDEN)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      await assert.rejects(
        () => participantService.addParticipant(actorAdmin, taskId, 'usr-tech-3'),
        (err) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
      );
    });

    it('ADMIN_MASTER NÃO pode remover participante operacional (403 FORBIDDEN)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');
      const added = await participantService.addParticipant(actorSec, taskId, 'usr-tech-3');

      await assert.rejects(
        () => participantService.removeParticipant(actorAdmin, taskId, added.id, 'REMOVED_BY_MANAGER'),
        (err) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
      );
    });

    it('ADMIN_MASTER PODE inicializar conversa legada com registro em trilha de auditoria', async () => {
      const { mockPrisma, getStore } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      const result = await chatService.initLegacyConversation(actorAdmin, taskId, 'Manutenção técnica de legado');
      assert.ok(result);
      assert.equal(result.taskId, taskId);

      const store = getStore();
      const audit = store.auditEvents.find((a) => a.action === 'CHAT_INITIALIZED_LEGACY');
      assert.ok(audit);
      assert.equal(audit.actorId, 'usr-admin');
      assert.equal(audit.reason, 'Manutenção técnica de legado');
    });

    it('SECRETARY possui permissão global para gerenciar participantes em qualquer equipe', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskAlpha = '11111111-1111-4111-8111-111111111111';
      const taskBeta = '22222222-2222-4222-8222-222222222222';
      await chatService.ensureConversationForTask(mockPrisma, taskAlpha, 'cycle-1', 'usr-creator', 'usr-tech-1');
      await chatService.ensureConversationForTask(mockPrisma, taskBeta, 'cycle-2', 'usr-creator-2', 'usr-tech-2');

      const addedAlpha = await participantService.addParticipant(actorSec, taskAlpha, 'usr-tech-3');
      const addedBeta = await participantService.addParticipant(actorSec, taskBeta, 'usr-tech-3');
      assert.ok(addedAlpha);
      assert.ok(addedBeta);

      const remAlpha = await participantService.removeParticipant(actorSec, taskAlpha, addedAlpha.id);
      const remBeta = await participantService.removeParticipant(actorSec, taskBeta, addedBeta.id);
      assert.equal(remAlpha.isActive, false);
      assert.equal(remBeta.isActive, false);
    });

    it('MANAGER só pode gerenciar participantes na sua própria equipe (outra equipe retorna 403)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskBeta = '22222222-2222-4222-8222-222222222222'; // team-beta
      await chatService.ensureConversationForTask(mockPrisma, taskBeta, 'cycle-2', 'usr-creator-2', 'usr-tech-2');

      // Gestor da equipe Alpha tenta gerenciar participante na tarefa da equipe Beta
      await assert.rejects(
        () => participantService.addParticipant(actorMgrAlpha, taskBeta, 'usr-tech-3'),
        (err) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
      );
    });
  });

  describe('Concorrência e Idempotência Real (Fase 4.3.1)', () => {
    it('chamadas concorrentes simultâneas (Promise.all) para ensureConversationForTask criam exatamente 1 conversa', async () => {
      const { mockPrisma, getStore } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';

      // Dispara 5 chamadas simultâneas simulando alta concorrência
      const results = await Promise.all([
        chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1'),
        chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1'),
        chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1'),
        chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1'),
        chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1'),
      ]);

      const store = getStore();
      assert.equal(store.conversations.length, 1, 'Deve haver exatamente 1 conversa persistida');
      assert.equal(store.lockStates.length, 1, 'Deve haver exatamente 1 estado de lock persistido');

      // Todas as 5 promises devem ter retornado a mesma conversa
      for (const r of results) {
        assert.equal(r.id, store.conversations[0].id);
        assert.equal(r.taskId, taskId);
      }
    });

    it('chamadas concorrentes simultâneas (Promise.all) para ensureParticipantActive criam exatamente 1 participante e 1 período ativo', async () => {
      const { mockPrisma, getStore } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      const conv = await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      // Dispara inclusões concorrentes do mesmo usuário usr-tech-3
      const results = await Promise.all([
        participantService.ensureParticipantActive(mockPrisma, conv.id, 'usr-tech-3', 'usr-sec'),
        participantService.ensureParticipantActive(mockPrisma, conv.id, 'usr-tech-3', 'usr-sec'),
        participantService.ensureParticipantActive(mockPrisma, conv.id, 'usr-tech-3', 'usr-sec'),
      ]);

      const store = getStore();
      const tech3Participants = store.participants.filter((p) => p.userId === 'usr-tech-3');
      assert.equal(tech3Participants.length, 1, 'Deve haver exatamente 1 participante criado');

      const tech3Periods = store.periods.filter((p) => p.participantId === tech3Participants[0].id);
      assert.equal(tech3Periods.length, 1, 'Deve haver exatamente 1 período de participação criado');
      assert.equal(tech3Periods[0].endedAt, null, 'O período deve estar ativo');

      for (const r of results) {
        assert.equal(r.id, tech3Participants[0].id);
      }
    });

    it('reatribuições concorrentes serializadas mantêm histórico íntegro de todos os responsáveis', async () => {
      const { mockPrisma, getStore } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      // Reatribuição sequencial rápida / concorrente
      await Promise.all([
        chatService.handleTaskReassignment(mockPrisma, taskId, 'cycle-1', 'usr-mgr-alpha', 'usr-tech-2', 'usr-tech-1'),
        chatService.handleTaskReassignment(mockPrisma, taskId, 'cycle-1', 'usr-mgr-alpha', 'usr-tech-3', 'usr-tech-2'),
      ]);

      const store = getStore();
      // Criador, tech-1, tech-2 e tech-3 devem ser participantes ativos
      assert.equal(store.participants.length, 4);
      for (const p of store.participants) {
        const activePer = store.periods.find((per) => per.participantId === p.id && per.endedAt === null);
        assert.ok(activePer, `Participante ${p.userId} deve manter período ativo`);
      }
    });
  });

  describe('Transações e Rollback Atômico (Fase 4.3.1)', () => {
    it('falha no chat durante a transação faz rollback de todas as operações atômicas', async () => {
      let taskPersisted = false;
      let cyclePersisted = false;
      let assignmentPersisted = false;
      let conversationPersisted = false;

      const mockTransactionalPrisma = {
        async $transaction(fn) {
          const tx = {
            task: {
              async create() { taskPersisted = true; return { id: 'task-new' }; },
            },
            taskCycle: {
              async create() { cyclePersisted = true; return { id: 'cycle-new' }; },
            },
            taskAssignment: {
              async create() { assignmentPersisted = true; return { id: 'asgn-new' }; },
            },
            chatConversation: {
              async findUnique() { return null; },
              async create() {
                conversationPersisted = true;
                // Simula falha catastrófica ou timeout de banco no módulo de chat
                throw new Error('DATABASE_CONNECTION_LOST');
              },
            },
          };

          try {
            return await fn(tx);
          } catch (err) {
            // Rollback atômico da transação: desfaz todas as alterações
            taskPersisted = false;
            cyclePersisted = false;
            assignmentPersisted = false;
            conversationPersisted = false;
            throw err;
          }
        },
      };

      const participantService = createChatParticipantService({ prisma: mockTransactionalPrisma });
      const chatService = createChatService({ prisma: mockTransactionalPrisma, participantService });

      // Simulação do fluxo de criação do task.service.js com tx único compartilhado
      await assert.rejects(
        async () => {
          await mockTransactionalPrisma.$transaction(async (tx) => {
            await tx.task.create();
            await tx.taskCycle.create();
            await tx.taskAssignment.create();
            // Invocação com o mesmo tx
            await chatService.ensureConversationForTask(tx, 'task-new', 'cycle-new', 'usr-creator', 'usr-tech-1');
          });
        },
        (err) => err.message === 'DATABASE_CONNECTION_LOST'
      );

      // Verificação de rollback atômico integral
      assert.equal(taskPersisted, false, 'A tarefa NÃO deve ser persistida após falha do chat');
      assert.equal(cyclePersisted, false, 'O ciclo NÃO deve ser persistido após falha do chat');
      assert.equal(assignmentPersisted, false, 'A atribuição NÃO deve ser persistida após falha do chat');
      assert.equal(conversationPersisted, false, 'A conversa NÃO deve ser persistida após falha do chat');
    });
  });

  describe('Isolamento, Privacidade e Integridade de IDs (Fase 4.3.1)', () => {
    it('GET /chat é estritamente idempotente e não gera escritas no banco de dados', async () => {
      const { mockPrisma, getStore } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      const storeBefore = JSON.stringify(getStore());
      await chatService.getConversation(actorTech1, taskId);
      await chatService.getConversation(actorTech1, taskId);
      await chatService.getConversation(actorTech1, taskId);
      const storeAfter = JSON.stringify(getStore());

      assert.equal(storeBefore, storeAfter, 'Múltiplas chamadas GET não devem alterar o banco de dados');
    });

    it('Gestor de outra equipe tem consulta a GET /chat bloqueada com 403 FORBIDDEN', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111'; // equipe alpha
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      await assert.rejects(
        () => chatService.getConversation(actorMgrBeta, taskId),
        (err) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
      );
    });

    it('Técnico não participante tem consulta a GET /chat bloqueada com 403 FORBIDDEN', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const taskId = '11111111-1111-4111-8111-111111111111';
      await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

      await assert.rejects(
        () => chatService.getConversation(actorTech3, taskId),
        (err) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
      );
    });

    it('rejeita remoção quando o participantId pertence a outra conversa (404 PARTICIPANT_NOT_FOUND)', async () => {
      const { mockPrisma } = makeMockPrisma();
      const participantService = createChatParticipantService({ prisma: mockPrisma });
      const chatService = createChatService({ prisma: mockPrisma, participantService });

      const task1 = '11111111-1111-4111-8111-111111111111';
      const task2 = '22222222-2222-4222-8222-222222222222';
      await chatService.ensureConversationForTask(mockPrisma, task1, 'cycle-1', 'usr-creator', 'usr-tech-1');
      await chatService.ensureConversationForTask(mockPrisma, task2, 'cycle-2', 'usr-creator-2', 'usr-tech-2');

      const participantsTask2 = await participantService.listParticipants(actorSec, task2);
      const targetFromTask2 = participantsTask2[0].id;

      // Tentativa de adulteração: invoca DELETE em task1 passando participantId pertencente a task2
      await assert.rejects(
        () => participantService.removeParticipant(actorSec, task1, targetFromTask2, 'REMOVED_BY_MANAGER'),
        (err) => err instanceof AppError && err.status === 404 && err.code === 'PARTICIPANT_NOT_FOUND'
      );
    });
  });
});
