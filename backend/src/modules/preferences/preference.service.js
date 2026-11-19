import { randomUUID } from 'node:crypto';
import { AppError } from '../../shared/errors/app-error.js';
import { scopeWhere } from '../tasks/task.service.js';

export const createPreferenceService = ({ prisma }) => ({
  async listKanbanColors(actor, { taskIds }) {
    let parsedTaskIds = [];
    if (typeof taskIds === 'string' && taskIds.trim()) {
      parsedTaskIds = taskIds
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && id.length <= 36)
        .slice(0, 500);
    }

    const where = {
      deletedAt: null,
      AND: [scopeWhere(actor)],
    };

    if (parsedTaskIds.length > 0) {
      where.id = { in: parsedTaskIds };
    } else if (taskIds !== undefined) {
      // Se taskIds foi enviado explicitamente vazio, retorna lista vazia
      return { colors: {} };
    }

    const authorizedTasks = await prisma.task.findMany({
      where,
      select: { id: true },
    });

    const authorizedTaskIds = authorizedTasks.map((t) => t.id);

    if (authorizedTaskIds.length === 0) {
      return { colors: {} };
    }

    const preferences = await prisma.userTaskPreference.findMany({
      where: {
        userId: actor.userId,
        taskId: { in: authorizedTaskIds },
      },
      select: { taskId: true, color: true },
    });

    const colors = Object.fromEntries(preferences.map((p) => [p.taskId, p.color]));
    return { colors };
  },

  async updateKanbanColor(actor, taskId, color) {
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        deletedAt: null,
        AND: [scopeWhere(actor)],
      },
      select: { id: true },
    });

    if (!task) {
      throw new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada ou fora do escopo de acesso.');
    }

    if (color === undefined) {
      throw new AppError(400, 'COLOR_REQUIRED', 'A cor da tarefa deve ser informada.');
    }

    if (!color || color === 'default') {
      await prisma.userTaskPreference.deleteMany({
        where: {
          userId: actor.userId,
          taskId,
        },
      });
      return { taskId, color: null };
    }

    const normalizedColor = typeof color === 'string' && color.startsWith('#') ? color.toLowerCase() : color;

    const updated = await prisma.userTaskPreference.upsert({
      where: {
        userId_taskId: {
          userId: actor.userId,
          taskId,
        },
      },
      create: {
        id: randomUUID(),
        userId: actor.userId,
        taskId,
        color: normalizedColor,
      },
      update: {
        color: normalizedColor,
      },
      select: {
        taskId: true,
        color: true,
      },
    });

    return updated;
  },

  async deleteKanbanColor(actor, taskId) {
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        deletedAt: null,
        AND: [scopeWhere(actor)],
      },
      select: { id: true },
    });

    if (!task) {
      throw new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada ou fora do escopo de acesso.');
    }

    await prisma.userTaskPreference.deleteMany({
      where: {
        userId: actor.userId,
        taskId,
      },
    });

    return { taskId, color: null };
  },
});
