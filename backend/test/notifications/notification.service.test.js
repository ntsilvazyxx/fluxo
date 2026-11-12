import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const makePrisma = () => {
  const notifications = [];
  const preferences = new Map();
  return {
    notification: {
      count: async ({ where }) => {
        let list = notifications;
        if (where.userId) list = list.filter((n) => n.userId === where.userId);
        if (where.readAt === null) list = list.filter((n) => !n.readAt);
        return list.length;
      },
      findMany: async ({ where, skip, take }) => {
        let list = notifications.filter((n) => n.userId === where.userId);
        if (where.readAt === null) list = list.filter((n) => !n.readAt);
        list = list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const sliced = list.slice(skip, skip + take);
        return sliced.map((n) => ({ ...n, readAt: n.readAt }));
      },
      findFirst: async ({ where }) => notifications.find((n) => n.id === where.id && n.userId === where.userId),
      update: async ({ where, data }) => {
        const idx = notifications.findIndex((n) => n.id === where.id);
        if (idx === -1) throw new Error('not found');
        notifications[idx] = { ...notifications[idx], ...data };
        return notifications[idx];
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const n of notifications) {
          if (n.userId === where.userId && (!where.readAt || n.readAt === null)) {
            n.readAt = data.readAt;
            count += 1;
          }
        }
        return { count };
      },
      create: async ({ data }) => {
        const n = { id: data.id, ...data, readAt: null, createdAt: new Date() };
        notifications.push(n);
        return n;
      },
    },
    notificationPreference: {
      findUnique: async ({ where }) => preferences.get(`${where.userId}:${where.notificationType}`),
    },
    taskAssignment: {
      findUnique: async ({ where }) => {
        if (where.id === 'assign-1') return { userId: 'user-1' };
        return null;
      },
    },
    taskRequest: {
      findUnique: async ({ where }) => {
        if (where.id === 'request-1') return { assignment: { userId: 'user-1' }, decidedById: 'user-2' };
        return null;
      },
    },
    taskCycle: {
      findUnique: async ({ where }) => {
        if (where.id === 'cycle-1') {
          return {
            assignments: [{ userId: 'user-1' }],
            task: { createdById: 'user-3' },
          };
        }
        return null;
      },
    },
    outboxEvent: {
      findUnique: async () => null,
      create: async ({ data }) => data,
      update: async ({ data }) => data,
      updateMany: async () => ({ count: 0 }),
    },
    emailDelivery: {
      create: async ({ data }) => data,
    },
  };
};

describe('notification service', () => {
  it('lista, marca como lida e marca todas como lidas', async () => {
    const prisma = makePrisma();
    const { createNotificationService } = await import('../../src/modules/notifications/notification.service.js');
    const service = createNotificationService({ prisma });

    await service.create({ userId: 'user-1', type: 'TASK_ASSIGNED', title: 'Título', body: 'Corpo', entityType: 'Task', entityId: 'task-1' });
    await service.create({ userId: 'user-1', type: 'TASK_COMPLETED', title: 'Título 2', body: 'Corpo 2', entityType: 'Task', entityId: 'task-2' });
    await service.create({ userId: 'user-2', type: 'TASK_ASSIGNED', title: 'Outro', body: 'Outro corpo', entityType: 'Task', entityId: 'task-3' });

    const list = await service.list({ userId: 'user-1' }, { page: 1, pageSize: 20 });
    assert.equal(list.notifications.length, 2);
    assert.equal(list.meta.unread, 2);
    assert.equal(list.meta.total, 2);

    const unreadList = await service.list({ userId: 'user-1' }, { page: 1, pageSize: 20, unread: true });
    assert.equal(unreadList.notifications.length, 2);

    const otherList = await service.list({ userId: 'user-2' }, { page: 1, pageSize: 20 });
    assert.equal(otherList.notifications.length, 1);

    const marked = await service.markRead({ userId: 'user-1' }, list.notifications[0].id);
    assert.ok(marked.readAt);

    const after = await service.list({ userId: 'user-1' }, { page: 1, pageSize: 20 });
    assert.equal(after.meta.unread, 1);

    const outro = await service.markRead({ userId: 'user-1' }, list.notifications[1].id);
    assert.ok(outro.readAt);

    const allRead = await service.list({ userId: 'user-1' }, { page: 1, pageSize: 20 });
    assert.equal(allRead.meta.unread, 0);

    // marcação por outro usuário deve falhar (404)
    await assert.rejects(
      service.markRead({ userId: 'user-2' }, list.notifications[0].id),
      (error) => error.code === 'NOTIFICATION_NOT_FOUND',
    );

    // markReadAll
    await service.create({ userId: 'user-1', type: 'TASK_ASSIGNED', title: 'Novo', body: 'Novo corpo', entityType: 'Task', entityId: 'task-4' });
    const beforeAll = await service.list({ userId: 'user-1' }, { page: 1, pageSize: 20 });
    assert.equal(beforeAll.meta.unread, 1);
    await service.markReadAll({ userId: 'user-1' });
    const afterAll = await service.list({ userId: 'user-1' }, { page: 1, pageSize: 20 });
    assert.equal(afterAll.meta.unread, 0);
  });
});
