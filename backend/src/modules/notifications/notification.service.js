import { randomUUID } from 'node:crypto';

import { AppError } from '../../shared/errors/app-error.js';

const missingNotification = () => new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notificação não encontrada.');

export const createNotificationService = ({ prisma }) => ({
  async list(actor, { page, pageSize, unread }) {
    const where = {
      userId: actor.userId,
      ...(unread === true ? { readAt: null } : {}),
    };

    const skip = (page - 1) * pageSize;

    const [total, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          entityType: true,
          entityId: true,
          readAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return {
      notifications,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        unread: await prisma.notification.count({
          where: { userId: actor.userId, readAt: null },
        }),
      },
    };
  },

  async markRead(actor, id) {
    const notification = await prisma.notification.findFirst({
      where: { id, userId: actor.userId },
    });
    if (!notification) throw missingNotification();
    if (notification.readAt) return notification;

    return prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
      select: {
        id: true, type: true, title: true, body: true, entityType: true, entityId: true, readAt: true, createdAt: true,
      },
    });
  },

  async markReadAll(actor) {
    await prisma.notification.updateMany({
      where: { userId: actor.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { marked: true };
  },

  async create({ userId, type, title, body, entityType, entityId }) {
    return prisma.notification.create({
      data: {
        id: randomUUID(),
        userId,
        type,
        title,
        body,
        entityType,
        entityId,
      },
    });
  },
});
