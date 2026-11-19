import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createOutboxService } from '../../src/modules/outbox/outbox.service.js';

const makePrismaMock = () => {
  const notifications = [];
  const preferences = new Map();

  return {
    notification: {
      upsert: async ({ where, create }) => {
        const existing = notifications.find((n) => n.id === where.id);
        if (existing) return existing;
        notifications.push(create);
        return create;
      },
      findMany: async () => notifications,
    },
    notificationPreference: {
      findUnique: async ({ where }) => preferences.get(`${where.userId_notificationType.userId}:${where.userId_notificationType.notificationType}`),
    },
    taskAssignment: {
      findUnique: async ({ where }) => {
        if (where.id === 'asg-10') return { userId: 'tech-1' };
        return null;
      },
    },
    taskRequest: {
      findUnique: async ({ where }) => {
        if (where.id === 'req-return-1') {
          return {
            assignment: { userId: 'tech-1' },
            decidedById: null,
            cycle: {
              task: {
                createdById: 'creator-1',
                team: { managers: [{ userId: 'manager-1' }] },
              },
            },
          };
        }
        if (where.id === 'req-return-decided') {
          return {
            assignment: { userId: 'tech-1' },
            decidedById: 'manager-1',
            cycle: {
              task: {
                createdById: 'creator-1',
                team: { managers: [{ userId: 'manager-1' }] },
              },
            },
          };
        }
        return null;
      },
    },
    taskCycle: {
      findUnique: async ({ where }) => {
        if (where.id === 'cycle-100') {
          return {
            assignments: [{ userId: 'tech-1' }],
            task: {
              createdById: 'creator-1',
              team: { managers: [{ userId: 'manager-1' }] },
            },
          };
        }
        if (where.id === 'cycle-reopened') {
          return {
            assignments: [],
            task: {
              createdById: 'creator-1',
              team: { managers: [{ userId: 'manager-1' }] },
            },
          };
        }
        if (where.id === 'cycle-prev') {
          return {
            assignments: [{ userId: 'tech-prev' }],
          };
        }
        return null;
      },
    },
    user: {
      findUnique: async ({ where }) => ({ id: where.id, emailNormalized: `${where.id}@seaf.mt.gov.br`, name: 'User' }),
    },
    emailDelivery: {
      upsert: async () => ({ status: 'PENDING' }),
      update: async () => ({}),
    },
    _getNotifications: () => notifications,
  };
};

describe('Validação dos eventos de ciclo de vida e notificações', () => {
  const dummyEmailSender = {
    testMode: true,
    send: async () => ({ status: 'SENT', sentAt: new Date() }),
  };

  it('1. TASK_ASSIGNED: notifica o técnico atribuído', async () => {
    const prisma = makePrismaMock();
    const service = createOutboxService({ emailSender: dummyEmailSender });

    await service.processEvent(prisma, {
      id: 'event-1',
      eventType: 'TASK_ASSIGNED',
      payloadJson: { taskId: 'task-1', assignmentId: 'asg-10', publicNumber: '101' },
    });

    const notifs = prisma._getNotifications();
    const techNotif = notifs.find((n) => n.userId === 'tech-1');
    assert.ok(techNotif, 'Técnico deve receber notificação de atribuição');
    assert.match(techNotif.title, /Nova atribuição/);
    assert.equal(techNotif.entityId, 'task-1');
  });

  it('2. ASSIGNMENT_ACCEPTED: notifica aceite de atribuição', async () => {
    const prisma = makePrismaMock();
    const service = createOutboxService({ emailSender: dummyEmailSender });

    await service.processEvent(prisma, {
      id: 'event-2',
      eventType: 'ASSIGNMENT_ACCEPTED',
      payloadJson: { taskId: 'task-1', assignmentId: 'asg-10', userId: 'tech-1', publicNumber: '101' },
    });

    const notifs = prisma._getNotifications();
    const notif = notifs.find((n) => n.userId === 'tech-1');
    assert.ok(notif, 'Notificação de aceite gerada');
    assert.match(notif.title, /Atribuição aceita/);
  });

  it('3. RETURN_REQUESTED: notifica técnico solicitante, criador e gestores da equipe', async () => {
    const prisma = makePrismaMock();
    const service = createOutboxService({ emailSender: dummyEmailSender });

    await service.processEvent(prisma, {
      id: 'event-3',
      eventType: 'RETURN_REQUESTED',
      payloadJson: { taskId: 'task-1', requestId: 'req-return-1', publicNumber: '101' },
    });

    const notifs = prisma._getNotifications();
    assert.ok(notifs.some((n) => n.userId === 'manager-1'), 'Gestor da equipe deve receber a solicitação de devolução');
    assert.ok(notifs.some((n) => n.userId === 'creator-1'), 'Criador da tarefa deve receber a solicitação de devolução');
  });

  it('4. RETURN_APPROVED: notifica técnico e quem decidiu', async () => {
    const prisma = makePrismaMock();
    const service = createOutboxService({ emailSender: dummyEmailSender });

    await service.processEvent(prisma, {
      id: 'event-4',
      eventType: 'RETURN_APPROVED',
      payloadJson: { taskId: 'task-1', requestId: 'req-return-decided', publicNumber: '101' },
    });

    const notifs = prisma._getNotifications();
    assert.ok(notifs.some((n) => n.userId === 'tech-1'), 'Técnico recebe notificação de devolução aprovada');
    const notif = notifs.find((n) => n.userId === 'tech-1');
    assert.match(notif.title, /Devolução de tarefa aprovada/);
  });

  it('5. TASK_COMPLETED: notifica criador e gestores da conclusão', async () => {
    const prisma = makePrismaMock();
    const service = createOutboxService({ emailSender: dummyEmailSender });

    await service.processEvent(prisma, {
      id: 'event-5',
      eventType: 'TASK_COMPLETED',
      payloadJson: { taskId: 'task-1', cycleId: 'cycle-100', publicNumber: '101' },
    });

    const notifs = prisma._getNotifications();
    assert.ok(notifs.some((n) => n.userId === 'creator-1'), 'Criador deve ser notificado da conclusão');
    assert.ok(notifs.some((n) => n.userId === 'manager-1'), 'Gestor deve ser notificado da conclusão');
  });

  it('6. TASK_REOPENED: notifica criador, gestor e técnico anterior da reabertura', async () => {
    const prisma = makePrismaMock();
    const service = createOutboxService({ emailSender: dummyEmailSender });

    await service.processEvent(prisma, {
      id: 'event-6',
      eventType: 'TASK_REOPENED',
      payloadJson: { taskId: 'task-1', cycleId: 'cycle-reopened', previousCycleId: 'cycle-prev', publicNumber: '101' },
    });

    const notifs = prisma._getNotifications();
    assert.ok(notifs.some((n) => n.userId === 'creator-1'), 'Criador notificado da reabertura');
    assert.ok(notifs.some((n) => n.userId === 'manager-1'), 'Gestor notificado da reabertura');
    assert.ok(notifs.some((n) => n.userId === 'tech-prev'), 'Técnico anterior notificado da reabertura');
  });
});
