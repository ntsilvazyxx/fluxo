import { randomUUID } from 'node:crypto';
import { AppError } from '../../shared/errors/app-error.js';
import { TERMINAL_STATUSES } from '../tasks/task.policy.js';
import { scopeWhere } from '../tasks/task.service.js';

export const presentComment = (comment) => ({
  id: comment.id,
  taskId: comment.taskId,
  content: comment.content,
  clientMessageId: comment.clientMessageId ?? null,
  createdAt: comment.createdAt instanceof Date ? comment.createdAt.toISOString() : comment.createdAt,
  updatedAt: comment.updatedAt instanceof Date ? comment.updatedAt.toISOString() : comment.updatedAt,
  author: comment.author
    ? {
        id: comment.author.id,
        name: comment.author.name,
        role: comment.author.role
          ? {
              code: comment.author.role.code,
              label: comment.author.role.label,
            }
          : null,
      }
    : { id: comment.authorId, name: 'Usuário' },
});

export const createCommentService = ({ prisma }) => {
  const missing = () => new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada.');

  const ensureTaskAccessible = async (actor, taskId) => {
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        deletedAt: null,
        ...scopeWhere(actor),
      },
      include: {
        currentCycle: {
          select: {
            id: true,
            status: true,
            closedAt: true,
            version: true,
          },
        },
      },
    });

    if (!task) throw missing();
    return task;
  };

  return {
    async list(actor, taskId) {
      await ensureTaskAccessible(actor, taskId);

      const comments = await prisma.taskComment.findMany({
        where: { taskId },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              role: {
                select: { code: true, label: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      return comments.map(presentComment);
    },

    async create(request, taskId, input) {
      const task = await ensureTaskAccessible(request.auth, taskId);

      // Bloqueia envio de novos comentários para ciclos fechados (COMPLETED ou CANCELLED)
      const currentCycle = task.currentCycle;
      if (!currentCycle || currentCycle.closedAt || TERMINAL_STATUSES.includes(currentCycle.status)) {
        throw new AppError(
          409,
          'TASK_CYCLE_CLOSED',
          'O envio de comentários está desabilitado para tarefas finalizadas.',
        );
      }

      // 1. Proteção contra duplicação via clientMessageId (idempotência / retentativas após falhas de conexão)
      if (input.clientMessageId) {
        const existingByClient = await prisma.taskComment.findUnique({
          where: { clientMessageId: input.clientMessageId },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                role: { select: { code: true, label: true } },
              },
            },
          },
        });
        if (existingByClient) {
          return presentComment(existingByClient);
        }
      }

      // 2. Proteção contra clique duplo rápido acidental (mesmo autor, mesma tarefa, mesmo conteúdo nos últimos 3 segundos)
      const recentThreshold = new Date(Date.now() - 3000);
      const recentDuplicate = await prisma.taskComment.findFirst({
        where: {
          taskId,
          authorId: request.auth.userId,
          content: input.content,
          createdAt: { gte: recentThreshold },
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              role: { select: { code: true, label: true } },
            },
          },
        },
      });
      if (recentDuplicate) {
        return presentComment(recentDuplicate);
      }

      const comment = await prisma.taskComment.create({
        data: {
          id: randomUUID(),
          taskId,
          authorId: request.auth.userId,
          content: input.content,
          clientMessageId: input.clientMessageId || null,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              role: {
                select: { code: true, label: true },
              },
            },
          },
        },
      });

      return presentComment(comment);
    },
  };
};

