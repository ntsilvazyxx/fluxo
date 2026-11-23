import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createChatLockService } from '../../src/modules/chat/chat-lock.service.js';
import { createChatMessageService } from '../../src/modules/chat/chat-message.service.js';
import { createChatParticipantService } from '../../src/modules/chat/chat-participant.service.js';
import { createChatService } from '../../src/modules/chat/chat.service.js';
import { createChatController } from '../../src/modules/chat/chat.controller.js';
import { AppError } from '../../src/shared/errors/app-error.js';

describe('Chat Locks, Solicitações e Ciclos de Tarefas (Fase 4.5)', () => {
  const makeMockPrisma = () => {
    let conversations = [];
    let lockStates = [];
    let lockEvents = [];
    let participants = [];
    let periods = [];
    let messages = [];
    let auditEvents = [];
    let taskRequests = [];
    let taskAssignments = [];
    let taskCycles = [];
    let outboxEvents = [];

    const tasks = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        teamId: 'team-alpha',
        createdById: 'usr-creator',
        currentCycleId: 'cycle-1',
        deletedAt: null,
        version: 1,
        team: {
          id: 'team-alpha',
          managers: [{ userId: 'usr-mgr-alpha', endedAt: null }],
        },
        currentCycle: {
          id: 'cycle-1',
          taskId: '11111111-1111-4111-8111-111111111111',
          cycleNumber: 1,
          status: 'IN_PROGRESS',
          version: 1,
          deadlineAt: new Date(Date.now() + 86400000),
          closedAt: null,
          requests: [],
          assignments: [{ id: 'asgn-1', cycleId: 'cycle-1', userId: 'usr-tech-1', endedAt: null, assignedAt: new Date() }],
        },
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        teamId: 'team-beta',
        createdById: 'usr-creator-2',
        currentCycleId: 'cycle-2',
        deletedAt: null,
        version: 1,
        team: {
          id: 'team-beta',
          managers: [{ userId: 'usr-mgr-beta', endedAt: null }],
        },
        currentCycle: {
          id: 'cycle-2',
          taskId: '22222222-2222-4222-8222-222222222222',
          cycleNumber: 1,
          status: 'IN_PROGRESS',
          version: 1,
          deadlineAt: new Date(Date.now() + 86400000),
          closedAt: null,
          requests: [],
          assignments: [{ id: 'asgn-2', cycleId: 'cycle-2', userId: 'usr-tech-2', endedAt: null, assignedAt: new Date() }],
        },
      },
    ];

    for (const t of tasks) {
      taskCycles.push(t.currentCycle);
      taskAssignments.push(...t.currentCycle.assignments);
    }

    const users = {
      'usr-admin': { id: 'usr-admin', name: 'Admin Master', role: { code: 'ADMIN_MASTER', label: 'Admin' }, isActive: true, deletedAt: null },
      'usr-sec': { id: 'usr-sec', name: 'Secretário Executivo', role: { code: 'SECRETARY', label: 'Secretário' }, isActive: true, deletedAt: null },
      'usr-mgr-alpha': { id: 'usr-mgr-alpha', name: 'Gestor Alpha', role: { code: 'MANAGER', label: 'Gestor' }, isActive: true, deletedAt: null },
      'usr-mgr-beta': { id: 'usr-mgr-beta', name: 'Gestor Beta', role: { code: 'MANAGER', label: 'Gestor' }, isActive: true, deletedAt: null },
      'usr-creator': { id: 'usr-creator', name: 'Criador Tarefa', role: { code: 'MANAGER', label: 'Gestor' }, isActive: true, deletedAt: null },
      'usr-tech-1': { id: 'usr-tech-1', name: 'Técnico 1', role: { code: 'TECH', label: 'Técnico' }, isActive: true, deletedAt: null },
      'usr-tech-2': { id: 'usr-tech-2', name: 'Técnico 2', role: { code: 'TECH', label: 'Técnico' }, isActive: true, deletedAt: null },
    };

    const mockClient = {
      task: {
        async findUnique({ where }) {
          const t = tasks.find((item) => item.id === where.id && (where.deletedAt === undefined || item.deletedAt === where.deletedAt)) ?? null;
          if (!t) return null;
          const cycle = taskCycles.find((c) => c.id === t.currentCycleId);
          return {
            ...t,
            currentCycle: cycle ? {
              ...cycle,
              requests: taskRequests.filter((r) => r.cycleId === cycle.id),
              assignments: taskAssignments.filter((a) => a.cycleId === cycle.id),
            } : null,
          };
        },
        async update({ where, data }) {
          const t = tasks.find((item) => item.id === where.id);
          if (!t) throw new Error('Task not found');
          if (data.currentCycleId) t.currentCycleId = data.currentCycleId;
          if (data.version?.increment) t.version = (t.version || 1) + 1;
          return t;
        },
      },
      taskCycle: {
        async findUnique({ where }) {
          return taskCycles.find((c) => c.id === where.id) ?? null;
        },
        async create({ data }) {
          const item = { ...data, createdAt: new Date() };
          taskCycles.push(item);
          return item;
        },
        async update({ where, data }) {
          const c = taskCycles.find((item) => item.id === where.id);
          if (!c) throw new Error('TaskCycle not found');
          if (data.status) c.status = data.status;
          if (data.closedAt !== undefined) c.closedAt = data.closedAt;
          if (data.version?.increment) c.version = (c.version || 1) + 1;
          return c;
        },
      },
      taskAssignment: {
        async findUnique({ where, include }) {
          const a = taskAssignments.find((item) => item.id === where.id) ?? null;
          if (!a) return null;
          if (include?.cycle?.include?.task) {
            const cycle = taskCycles.find((c) => c.id === a.cycleId);
            const task = tasks.find((t) => t.id === cycle?.taskId);
            return {
              ...a,
              cycle: {
                ...cycle,
                task,
              },
            };
          }
          return a;
        },
        async update({ where, data }) {
          const a = taskAssignments.find((item) => item.id === where.id);
          if (!a) throw new Error('Assignment not found');
          Object.assign(a, data);
          return a;
        },
        async updateMany({ where, data }) {
          let count = 0;
          for (const a of taskAssignments) {
            if (where.cycleId === a.cycleId && (where.endedAt === undefined || a.endedAt === where.endedAt)) {
              Object.assign(a, data);
              count++;
            }
          }
          return { count };
        },
      },
      taskRequest: {
        async findMany({ where }) {
          return taskRequests.filter((r) => (!where.cycleId || r.cycleId === where.cycleId) && (!where.status || r.status === where.status));
        },
        async create({ data }) {
          const item = { ...data, createdAt: new Date() };
          taskRequests.push(item);
          return item;
        },
        async update({ where, data }) {
          const r = taskRequests.find((item) => item.id === where.id);
          if (!r) throw new Error('Request not found');
          Object.assign(r, data);
          return r;
        },
        async updateMany({ where, data }) {
          let count = 0;
          for (const r of taskRequests) {
            if (where.id?.in?.includes(r.id)) {
              Object.assign(r, data);
              count++;
            }
          }
          return { count };
        },
      },
      taskPauseInterval: {
        async updateMany() { return { count: 0 }; },
      },
      user: {
        async findFirst({ where }) {
          return users[where.id] ?? null;
        },
        async findUnique({ where }) {
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
          return lockStates.find((l) => l.conversationId === where.conversationId || l.id === where.id) ?? null;
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
      chatLockEvent: {
        async create({ data }) {
          const item = { ...data, createdAt: new Date() };
          lockEvents.push(item);
          return item;
        },
        async findMany({ where }) {
          return lockEvents.filter((e) => !where.conversationId || e.conversationId === where.conversationId);
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
          let res = participants.filter((p) => !where.conversationId || p.conversationId === where.conversationId);
          return res.map((p) => ({
            ...p,
            user: users[p.userId] ?? null,
            periods: periods.filter((per) => per.participantId === p.id),
          }));
        },
        async create({ data }) {
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
        async create({ data }) {
          const item = { ...data, createdAt: new Date(), updatedAt: new Date() };
          messages.push(item);
          return item;
        },
        async findMany({ where, take }) {
          let list = messages.filter((m) => !where.conversationId || m.conversationId === where.conversationId);
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
          return messages.filter((m) => !where.conversationId || m.conversationId === where.conversationId).length;
        },
      },
      auditEvent: {
        async create({ data }) {
          auditEvents.push(data);
          return data;
        },
      },
      outboxEvent: {
        async create({ data }) {
          outboxEvents.push(data);
          return data;
        },
      },
      async $transaction(fn) {
        return fn(mockClient);
      },
      async $queryRaw() {
        return [];
      },
    };

    return {
      mockPrisma: mockClient,
      conversations,
      lockStates,
      lockEvents,
      participants,
      periods,
      messages,
      auditEvents,
      tasks,
      taskRequests,
      taskCycles,
    };
  };

  const actorAdmin = { userId: 'usr-admin', roleCode: 'ADMIN_MASTER' };
  const actorSec = { userId: 'usr-sec', roleCode: 'SECRETARY' };
  const actorMgrAlpha = { userId: 'usr-mgr-alpha', roleCode: 'MANAGER' };
  const actorTech1 = { userId: 'usr-tech-1', roleCode: 'TECH' };

  it('1. Abertura de solicitação RETURN bloqueia o Chat com motivo REQUEST_PENDING (LOCK_ACQUIRED)', async () => {
    const { mockPrisma, lockStates, lockEvents } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    const updated = await lockService.applyRequestLock(mockPrisma, taskId, 'cycle-1', 'req-return-1', 'usr-tech-1');

    assert.equal(updated.isLocked, true);
    assert.equal(updated.reason, 'REQUEST_PENDING');
    assert.equal(updated.requestId, 'req-return-1');

    const state = lockStates[0];
    assert.equal(state.isLocked, true);
    assert.equal(state.reason, 'REQUEST_PENDING');
    assert.equal(state.requestId, 'req-return-1');

    assert.equal(lockEvents.length, 1);
    assert.equal(lockEvents[0].eventType, 'LOCK_ACQUIRED');
    assert.equal(lockEvents[0].reason, 'REQUEST_PENDING');
    assert.equal(lockEvents[0].requestId, 'req-return-1');
  });

  it('2. Abertura de solicitação EXTENSION bloqueia o Chat com motivo REQUEST_PENDING', async () => {
    const { mockPrisma, lockEvents } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    const updated = await lockService.applyRequestLock(mockPrisma, taskId, 'cycle-1', 'req-ext-1', 'usr-tech-1');

    assert.equal(updated.isLocked, true);
    assert.equal(updated.reason, 'REQUEST_PENDING');
    assert.equal(updated.requestId, 'req-ext-1');
    assert.equal(lockEvents[0].eventType, 'LOCK_ACQUIRED');
  });

  it('3. Segunda solicitação pendente no mesmo ciclo mantém o bloqueio e emite LOCK_REASSERTED', async () => {
    const { mockPrisma, lockEvents } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    await lockService.applyRequestLock(mockPrisma, taskId, 'cycle-1', 'req-1', 'usr-tech-1');
    assert.equal(lockEvents.length, 1);
    assert.equal(lockEvents[0].eventType, 'LOCK_ACQUIRED');

    const reasserted = await lockService.applyRequestLock(mockPrisma, taskId, 'cycle-1', 'req-2', 'usr-tech-1');
    assert.equal(reasserted.isLocked, true);
    assert.equal(reasserted.reason, 'REQUEST_PENDING');

    assert.equal(lockEvents.length, 2);
    assert.equal(lockEvents[1].eventType, 'LOCK_REASSERTED');
    assert.equal(lockEvents[1].requestId, 'req-2');
    assert.equal(lockEvents[1].metadata.previousRequestId, 'req-1');
  });

  it('4. REGRA SEAF: Decisão sobre qualquer solicitação libera o bloqueio por solicitação (LOCK_RELEASED), mesmo com outra pendente', async () => {
    const { mockPrisma, lockEvents } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    await lockService.applyRequestLock(mockPrisma, taskId, 'cycle-1', 'req-1', 'usr-tech-1');
    await lockService.applyRequestLock(mockPrisma, taskId, 'cycle-1', 'req-2', 'usr-tech-1');

    const released = await lockService.releaseRequestLock(mockPrisma, taskId, 'cycle-1', 'req-1', 'usr-mgr-alpha', 'APPROVED');

    assert.equal(released.isLocked, false);
    assert.equal(released.reason, null);
    assert.equal(released.requestId, null);

    const lastEvent = lockEvents[lockEvents.length - 1];
    assert.equal(lastEvent.eventType, 'LOCK_RELEASED');
    assert.equal(lastEvent.requestId, 'req-1');
    assert.equal(lastEvent.metadata.decisionStatus, 'APPROVED');
  });

  it('5. Decisão de negação (DENIED) de uma solicitação também libera o bloqueio por solicitação (LOCK_RELEASED)', async () => {
    const { mockPrisma, lockEvents } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    await lockService.applyRequestLock(mockPrisma, taskId, 'cycle-1', 'req-denied', 'usr-tech-1');
    const released = await lockService.releaseRequestLock(mockPrisma, taskId, 'cycle-1', 'req-denied', 'usr-mgr-alpha', 'DENIED');

    assert.equal(released.isLocked, false);
    assert.equal(released.reason, null);

    const lastEvent = lockEvents[lockEvents.length - 1];
    assert.equal(lastEvent.eventType, 'LOCK_RELEASED');
    assert.equal(lastEvent.metadata.decisionStatus, 'DENIED');
  });

  it('6. Decisão subsequente com Chat já desbloqueado registra DECISION_RECORDED_WHILE_UNLOCKED sem re-bloquear', async () => {
    const { mockPrisma, lockStates, lockEvents } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    await lockService.applyRequestLock(mockPrisma, taskId, 'cycle-1', 'req-1', 'usr-tech-1');
    await lockService.applyRequestLock(mockPrisma, taskId, 'cycle-1', 'req-2', 'usr-tech-1');

    await lockService.releaseRequestLock(mockPrisma, taskId, 'cycle-1', 'req-1', 'usr-mgr-alpha', 'APPROVED');
    assert.equal(lockStates[0].isLocked, false);

    const stateAfterSecond = await lockService.releaseRequestLock(mockPrisma, taskId, 'cycle-1', 'req-2', 'usr-mgr-alpha', 'APPROVED');
    assert.equal(stateAfterSecond.isLocked, false);

    const lastEvent = lockEvents[lockEvents.length - 1];
    assert.equal(lastEvent.eventType, 'DECISION_RECORDED_WHILE_UNLOCKED');
    assert.equal(lastEvent.requestId, 'req-2');
  });

  it('7. Nova solicitação posterior reativa o bloqueio normalmente (LOCK_ACQUIRED)', async () => {
    const { mockPrisma, lockStates, lockEvents } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    await lockService.applyRequestLock(mockPrisma, taskId, 'cycle-1', 'req-1', 'usr-tech-1');
    await lockService.releaseRequestLock(mockPrisma, taskId, 'cycle-1', 'req-1', 'usr-mgr-alpha', 'APPROVED');
    assert.equal(lockStates[0].isLocked, false);

    const reLocked = await lockService.applyRequestLock(mockPrisma, taskId, 'cycle-1', 'req-3', 'usr-tech-1');
    assert.equal(reLocked.isLocked, true);
    assert.equal(reLocked.reason, 'REQUEST_PENDING');
    assert.equal(reLocked.requestId, 'req-3');

    const lastEvent = lockEvents[lockEvents.length - 1];
    assert.equal(lastEvent.eventType, 'LOCK_ACQUIRED');
    assert.equal(lastEvent.requestId, 'req-3');
  });

  it('8. Conclusão da tarefa (complete) bloqueia o Chat com CYCLE_CLOSED (CYCLE_TERMINATED)', async () => {
    const { mockPrisma, lockEvents } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    const updated = await lockService.applyCycleClosedLock(mockPrisma, taskId, 'cycle-1', 'usr-tech-1');
    assert.equal(updated.isLocked, true);
    assert.equal(updated.reason, 'CYCLE_CLOSED');

    const lastEvent = lockEvents[lockEvents.length - 1];
    assert.equal(lastEvent.eventType, 'CYCLE_TERMINATED');
    assert.equal(lastEvent.reason, 'CYCLE_CLOSED');
  });

  it('9. Cancelamento da tarefa (cancel) bloqueia o Chat com CYCLE_CLOSED (CYCLE_TERMINATED)', async () => {
    const { mockPrisma, lockEvents } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    const updated = await lockService.applyCycleClosedLock(mockPrisma, taskId, 'cycle-1', 'usr-creator');
    assert.equal(updated.isLocked, true);
    assert.equal(updated.reason, 'CYCLE_CLOSED');

    const lastEvent = lockEvents[lockEvents.length - 1];
    assert.equal(lastEvent.eventType, 'CYCLE_TERMINATED');
    assert.equal(lastEvent.reason, 'CYCLE_CLOSED');
  });

  it('10. Precedência: Decisão de solicitação não remove bloqueio quando a tarefa está em CYCLE_CLOSED (2 > 1)', async () => {
    const { mockPrisma, lockStates } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    await lockService.applyCycleClosedLock(mockPrisma, taskId, 'cycle-1', 'usr-creator');
    assert.equal(lockStates[0].reason, 'CYCLE_CLOSED');

    const state = await lockService.releaseRequestLock(mockPrisma, taskId, 'cycle-1', 'req-old', 'usr-mgr-alpha', 'APPROVED');
    assert.equal(state.isLocked, true);
    assert.equal(state.reason, 'CYCLE_CLOSED');
  });

  it('11. Precedência: Decisão de solicitação não remove bloqueio quando o Chat está em ADMIN_MAINTENANCE (3 > 1)', async () => {
    const { mockPrisma, lockStates } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    await lockService.adminLock(actorAdmin, taskId, {
      isLocked: true,
      reason: 'ADMIN_MAINTENANCE',
      justification: 'Manutenção emergencial técnica solicitada pela equipe',
    });
    assert.equal(lockStates[0].reason, 'ADMIN_MAINTENANCE');

    const state = await lockService.releaseRequestLock(mockPrisma, taskId, 'cycle-1', 'req-1', 'usr-mgr-alpha', 'APPROVED');
    assert.equal(state.isLocked, true);
    assert.equal(state.reason, 'ADMIN_MAINTENANCE');
  });

  it('12. Reabertura de ciclo (reopen) libera o bloqueio CYCLE_CLOSED e atualiza cycleId (CYCLE_REOPENED)', async () => {
    const { mockPrisma, lockStates, lockEvents } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    await lockService.applyCycleClosedLock(mockPrisma, taskId, 'cycle-1', 'usr-tech-1');
    assert.equal(lockStates[0].isLocked, true);

    const reopened = await lockService.releaseCycleClosedLock(mockPrisma, taskId, 'cycle-2', 'usr-mgr-alpha');
    assert.equal(reopened.isLocked, false);
    assert.equal(reopened.reason, null);
    assert.equal(reopened.cycleId, 'cycle-2');

    const lastEvent = lockEvents[lockEvents.length - 1];
    assert.equal(lastEvent.eventType, 'CYCLE_REOPENED');
    assert.equal(lastEvent.cycleId, 'cycle-2');
  });

  it('13. Reabertura de ciclo sob ADMIN_MAINTENANCE atualiza cycleId mas preserva ADMIN_MAINTENANCE ativo', async () => {
    const { mockPrisma, lockEvents } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    await lockService.adminLock(actorAdmin, taskId, {
      isLocked: true,
      reason: 'ADMIN_MAINTENANCE',
      justification: 'Bloqueio administrativo temporário preventivo',
    });

    const result = await lockService.releaseCycleClosedLock(mockPrisma, taskId, 'cycle-2', 'usr-mgr-alpha');
    assert.equal(result.isLocked, true);
    assert.equal(result.reason, 'ADMIN_MAINTENANCE');
    assert.equal(result.cycleId, 'cycle-2');

    const lastEvent = lockEvents[lockEvents.length - 1];
    assert.equal(lastEvent.eventType, 'CYCLE_REOPENED');
    assert.equal(lastEvent.reason, 'ADMIN_MAINTENANCE');
  });

  it('14. Bloqueio administrativo autorizado com ADMIN_MASTER ou SECRETARY (POST /lock)', async () => {
    const { mockPrisma, lockEvents } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    const resSec = await lockService.adminLock(actorSec, taskId, {
      isLocked: true,
      reason: 'ADMIN_MAINTENANCE',
      justification: 'Auditoria de segurança em conformidade com governança',
    });

    assert.equal(resSec.isLocked, true);
    assert.equal(resSec.reason, 'ADMIN_MAINTENANCE');

    const lastEvent = lockEvents[lockEvents.length - 1];
    assert.equal(lastEvent.eventType, 'ADMIN_INTERVENTION');
    assert.equal(lastEvent.actorId, 'usr-sec');
    assert.equal(lastEvent.metadata.action, 'LOCK');
  });

  it('15. Bloqueio administrativo negado para Gestor e Técnico com 403 FORBIDDEN', async () => {
    const { mockPrisma } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    await assert.rejects(
      () => lockService.adminLock(actorMgrAlpha, taskId, {
        isLocked: true,
        reason: 'ADMIN_MAINTENANCE',
        justification: 'Tentativa de bloqueio por gestor',
      }),
      (err) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
    );

    await assert.rejects(
      () => lockService.adminLock(actorTech1, taskId, {
        isLocked: true,
        reason: 'ADMIN_MAINTENANCE',
        justification: 'Tentativa de bloqueio por técnico',
      }),
      (err) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
    );
  });

  it('16. Desbloqueio administrativo autorizado reverte para CYCLE_CLOSED se o ciclo estiver concluído', async () => {
    const { mockPrisma, tasks } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    const task = tasks.find((t) => t.id === taskId);
    task.currentCycle.closedAt = new Date();

    await lockService.adminLock(actorAdmin, taskId, {
      isLocked: true,
      reason: 'ADMIN_MAINTENANCE',
      justification: 'Manutenção sobre tarefa concluída',
    });

    const unlocked = await lockService.adminLock(actorAdmin, taskId, {
      isLocked: false,
      justification: 'Manutenção concluída, revertendo para status do ciclo',
    });

    assert.equal(unlocked.isLocked, true);
    assert.equal(unlocked.reason, 'CYCLE_CLOSED');
  });

  it('17. Desbloqueio administrativo autorizado libera totalmente se o ciclo estiver ativo', async () => {
    const { mockPrisma } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    await lockService.adminLock(actorAdmin, taskId, {
      isLocked: true,
      reason: 'ADMIN_MAINTENANCE',
      justification: 'Manutenção temporária sobre ciclo ativo',
    });

    const unlocked = await lockService.adminLock(actorAdmin, taskId, {
      isLocked: false,
      justification: 'Fim da manutenção preventiva',
    });

    assert.equal(unlocked.isLocked, false);
    assert.equal(unlocked.reason, null);
  });

  it('18. Rejeita requisição de bloqueio administrativo com justificativa curta ou ausente via schema', async () => {
    const { adminLockRouteSchema } = await import('../../src/modules/chat/chat.schemas.js');

    assert.throws(
      () => adminLockRouteSchema.parse({
        params: { taskId: '11111111-1111-4111-8111-111111111111' },
        body: { isLocked: true, justification: 'abc' },
      }),
      (err) => err.name === 'ZodError'
    );

    assert.throws(
      () => adminLockRouteSchema.parse({
        params: { taskId: '11111111-1111-4111-8111-111111111111' },
        body: { isLocked: true },
      }),
      (err) => err.name === 'ZodError'
    );
  });

  it('19. Histórico append-only: chat_lock_events preserva ordem e metadados de todas as transições', async () => {
    const { mockPrisma, lockEvents } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    await lockService.applyRequestLock(mockPrisma, taskId, 'cycle-1', 'req-1', 'usr-tech-1');
    await lockService.applyRequestLock(mockPrisma, taskId, 'cycle-1', 'req-2', 'usr-tech-1');
    await lockService.releaseRequestLock(mockPrisma, taskId, 'cycle-1', 'req-1', 'usr-mgr-alpha', 'APPROVED');
    await lockService.applyCycleClosedLock(mockPrisma, taskId, 'cycle-1', 'usr-tech-1');
    await lockService.releaseCycleClosedLock(mockPrisma, taskId, 'cycle-2', 'usr-mgr-alpha');

    assert.equal(lockEvents.length, 5);
    assert.equal(lockEvents[0].eventType, 'LOCK_ACQUIRED');
    assert.equal(lockEvents[1].eventType, 'LOCK_REASSERTED');
    assert.equal(lockEvents[2].eventType, 'LOCK_RELEASED');
    assert.equal(lockEvents[3].eventType, 'CYCLE_TERMINATED');
    assert.equal(lockEvents[4].eventType, 'CYCLE_REOPENED');
  });

  it('20. Concorrência: sendMessage falha com 423 CHAT_LOCKED quando a conversa está bloqueada', async () => {
    const { mockPrisma } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const messageService = createChatMessageService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    // Bloqueia por solicitação
    await lockService.applyRequestLock(mockPrisma, taskId, 'cycle-1', 'req-1', 'usr-tech-1');

    // Tentativa de envio de mensagem enquanto bloqueado
    await assert.rejects(
      () => messageService.sendMessage(actorTech1, taskId, {
        content: 'Tentativa de mensagem durante bloqueio',
        clientMessageId: '550e8400-e29b-41d4-a716-446655440001',
      }),
      (err) => err instanceof AppError && err.status === 423 && err.code === 'CHAT_LOCKED'
    );
  });

  it('21. Isolamento de bloqueio entre diferentes tarefas e equipes', async () => {
    const { mockPrisma, lockStates } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const task1 = '11111111-1111-4111-8111-111111111111';
    const task2 = '22222222-2222-4222-8222-222222222222';

    await chatService.ensureConversationForTask(mockPrisma, task1, 'cycle-1', 'usr-creator', 'usr-tech-1');
    await chatService.ensureConversationForTask(mockPrisma, task2, 'cycle-2', 'usr-creator-2', 'usr-tech-2');

    await lockService.applyRequestLock(mockPrisma, task1, 'cycle-1', 'req-t1', 'usr-tech-1');

    const state1 = lockStates.find((l) => l.cycleId === 'cycle-1');
    const state2 = lockStates.find((l) => l.cycleId === 'cycle-2');

    assert.equal(state1.isLocked, true);
    assert.equal(state2.isLocked, false);
  });

  it('22. Leitura de mensagens (listMessages) e participantes permanece totalmente acessível com o Chat bloqueado', async () => {
    const { mockPrisma } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const messageService = createChatMessageService({ prisma: mockPrisma });
    const participantService = createChatParticipantService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    // Envia mensagem antes do bloqueio
    await messageService.sendMessage(actorTech1, taskId, {
      content: 'Mensagem enviada com chat aberto',
      clientMessageId: '550e8400-e29b-41d4-a716-446655440010',
    });

    // Bloqueia o Chat com CYCLE_CLOSED
    await lockService.applyCycleClosedLock(mockPrisma, taskId, 'cycle-1', 'usr-tech-1');

    // Leitura das mensagens deve funcionar normalmente
    const history = await messageService.listMessages(actorTech1, taskId, { limit: 20 });
    assert.equal(history.items.length, 1);
    assert.equal(history.items[0].content, 'Mensagem enviada com chat aberto');

    // Consulta de participantes também deve funcionar normalmente
    const participants = await participantService.listParticipants(actorTech1, taskId);
    assert.equal(participants.length, 2);
  });

  it('23. Integração Controller HTTP: POST /:taskId/chat/lock responde com 200 e payload de LockState formatado', async () => {
    const { mockPrisma } = makeMockPrisma();
    const chatService = createChatService({ prisma: mockPrisma });
    const lockService = createChatLockService({ prisma: mockPrisma });
    const controller = createChatController({ chatService, lockService });

    const taskId = '11111111-1111-4111-8111-111111111111';
    await chatService.ensureConversationForTask(mockPrisma, taskId, 'cycle-1', 'usr-creator', 'usr-tech-1');

    const req = {
      auth: actorAdmin,
      params: { taskId },
      body: {
        isLocked: true,
        reason: 'ADMIN_MAINTENANCE',
        justification: 'Bloqueio administrativo via controller HTTP',
      },
    };

    let statusCode = null;
    let jsonBody = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        jsonBody = payload;
        return this;
      },
    };

    await controller.adminLock(req, res);

    assert.equal(statusCode, 200);
    assert.equal(jsonBody.data.isLocked, true);
    assert.equal(jsonBody.data.reason, 'ADMIN_MAINTENANCE');
    assert.ok(jsonBody.data.lockedAt);
  });
});
