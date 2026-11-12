import { randomUUID } from 'node:crypto';

import { lockTaskAggregate } from '../../infrastructure/database/transaction.js';
import { AppError } from '../../shared/errors/app-error.js';
import { executeIdempotent } from '../../shared/http/idempotency.js';
import { requireExpectedVersion } from '../tasks/task.policy.js';
import { inspectImage, MAX_ACTIVE_IMAGES } from './image.validation.js';

const missingTask = () => new AppError(404, 'TASK_NOT_FOUND', 'Tarefa nÃ£o encontrada.');
const missingImage = () => new AppError(404, 'IMAGE_NOT_FOUND', 'Imagem nÃ£o encontrada.');
const conflict = (code, message) => new AppError(409, code, message);

const presentImage = (image, actor, currentCycleId) => ({
  id: image.id,
  cycleId: image.cycleId,
  cycleNumber: image.cycle.cycleNumber,
  cycleStatus: image.cycle.status,
  mimeType: image.mimeType,
  sizeBytes: Number(image.sizeBytes),
  createdAt: image.createdAt,
  uploadedBy: { id: image.uploadedBy.id, name: image.uploadedBy.name },
  isCurrentCycle: image.cycleId === currentCycleId,
  canDelete:
    image.uploadedById === actor.userId &&
    image.cycleId === currentCycleId &&
    !image.cycle.closedAt &&
    !image.deletedAt,
});

async function canViewTask(client, actor, task) {
  if (['ADMIN_MASTER', 'SECRETARY'].includes(actor.roleCode)) return true;
  if (actor.roleCode === 'MANAGER') {
    return Boolean(
      await client.teamManager.findFirst({
        where: { teamId: task.teamId, userId: actor.userId, endedAt: null },
        select: { id: true },
      }),
    );
  }
  return Boolean(
    await client.taskAssignment.findFirst({
      where: {
        cycleId: task.currentCycleId,
        userId: actor.userId,
        OR: [{ endedAt: null }, { endReason: 'COMPLETED' }],
      },
      select: { id: true },
    }),
  );
}

async function requireVisibleTask(client, actor, taskId) {
  const task = await client.task.findFirst({
    where: { id: taskId, deletedAt: null },
    select: { id: true, teamId: true, currentCycleId: true },
  });
  if (!task?.currentCycleId || !(await canViewTask(client, actor, task))) throw missingTask();
  return task;
}

async function lockCurrentCycle(client, taskId) {
  const initial = await client.task.findFirst({
    where: { id: taskId, deletedAt: null },
    select: { id: true, teamId: true, parentCycleId: true, currentCycleId: true },
  });
  if (!initial?.currentCycleId) throw missingTask();

  let parent = null;
  if (initial.parentCycleId) {
    parent = await client.taskCycle.findUnique({
      where: { id: initial.parentCycleId },
      select: { id: true, taskId: true, closedAt: true },
    });
    if (!parent) throw missingTask();
    await lockTaskAggregate(client, {
      rootTaskId: parent.taskId,
      subtaskIds: [initial.id],
      cycleIds: [parent.id, initial.currentCycleId],
    });
  } else {
    await lockTaskAggregate(client, {
      rootTaskId: initial.id,
      cycleIds: [initial.currentCycleId],
    });
  }

  const task = await client.task.findFirst({
    where: { id: taskId, deletedAt: null },
    select: { id: true, teamId: true, parentCycleId: true, currentCycleId: true },
  });
  if (!task?.currentCycleId) throw missingTask();
  if (parent?.closedAt) throw conflict('PARENT_CYCLE_CLOSED', 'O ciclo principal da subtarefa jÃ¡ foi encerrado.');

  const cycle = await client.taskCycle.findUnique({
    where: { id: task.currentCycleId },
    include: {
      assignments: { where: { endedAt: null } },
      requests: { where: { type: 'RETURN', status: 'PENDING' }, select: { id: true } },
    },
  });
  if (!cycle || cycle.closedAt) throw conflict('TASK_CYCLE_CLOSED', 'NÃ£o Ã© permitido alterar imagens de um ciclo encerrado.');
  return { task, cycle, assignment: cycle.assignments[0] ?? null };
}

async function findVisibleImage(client, actor, imageId) {
  const image = await client.taskImage.findUnique({
    where: { id: imageId },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      cycle: {
        select: {
          id: true,
          taskId: true,
          cycleNumber: true,
          status: true,
          closedAt: true,
          task: { select: { id: true, teamId: true, currentCycleId: true, deletedAt: true } },
        },
      },
    },
  });
  if (!image || image.cycle.task.deletedAt || !(await canViewTask(client, actor, image.cycle.task))) {
    throw missingImage();
  }
  return image;
}

export const createImageService = ({ prisma, storage }) => ({
  async list(actor, taskId) {
    const task = await requireVisibleTask(prisma, actor, taskId);
    const images = await prisma.taskImage.findMany({
      where: { cycle: { taskId }, deletedAt: null },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        cycle: { select: { cycleNumber: true, status: true, closedAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const current = await prisma.taskCycle.findUnique({
      where: { id: task.currentCycleId },
      include: {
        assignments: { where: { endedAt: null }, select: { userId: true } },
        requests: { where: { type: 'RETURN', status: 'PENDING' }, select: { id: true } },
      },
    });
    return {
      images: images.map((image) => presentImage(image, actor, task.currentCycleId)),
      permissions: {
        canUpload:
          current?.status === 'IN_PROGRESS' &&
          !current.closedAt &&
          current.assignments[0]?.userId === actor.userId &&
          current.requests.length === 0,
        maxActiveImages: MAX_ACTIVE_IMAGES,
      },
    };
  },

  async upload(request, taskId, file, input, key) {
    await requireVisibleTask(prisma, request.auth, taskId);
    const inspected = await inspectImage(file);
    const imageId = randomUUID();
    const keys = storage.createKeys(inspected.extension);
    await storage.stage(keys.stagingKey, file.buffer);

    try {
      const result = await executeIdempotent(prisma, {
        actorId: request.auth.userId,
        key,
        status: 201,
        payload: {
          taskId,
          expectedVersion: input.expectedVersion,
          checksum: inspected.checksum,
          sizeBytes: inspected.sizeBytes,
          mimeType: inspected.mimeType,
        },
        operation: async (tx) => {
          const { cycle, assignment } = await lockCurrentCycle(tx, taskId);
          requireExpectedVersion(cycle, input.expectedVersion);
          if (cycle.status !== 'IN_PROGRESS' || assignment?.userId !== request.auth.userId) {
            throw new AppError(403, 'IMAGE_UPLOAD_FORBIDDEN', 'Somente o responsÃ¡vel atual pode enviar imagens durante a execuÃ§Ã£o.');
          }
          if (cycle.requests.length) {
            throw conflict('RETURN_REQUEST_PENDING', 'NÃ£o Ã© permitido enviar imagens enquanto a devoluÃ§Ã£o estÃ¡ pendente.');
          }
          const activeCount = await tx.taskImage.count({
            where: { cycleId: cycle.id, deletedAt: null },
          });
          if (activeCount >= MAX_ACTIVE_IMAGES) {
            throw new AppError(422, 'IMAGE_LIMIT_REACHED', 'O ciclo jÃ¡ possui dez imagens ativas.');
          }

          const image = await tx.taskImage.create({
            data: {
              id: imageId,
              cycleId: cycle.id,
              uploadedById: request.auth.userId,
              storageKey: keys.storageKey,
              mimeType: inspected.mimeType,
              sizeBytes: BigInt(inspected.sizeBytes),
              checksum: inspected.checksum,
            },
            include: {
              uploadedBy: { select: { id: true, name: true } },
              cycle: { select: { cycleNumber: true, status: true, closedAt: true } },
            },
          });
          await tx.auditEvent.create({
            data: {
              id: randomUUID(),
              actorId: request.auth.userId,
              entityType: 'TaskImage',
              entityId: image.id,
              action: 'TASK_IMAGE_UPLOADED',
              afterJson: {
                taskId,
                cycleId: cycle.id,
                mimeType: inspected.mimeType,
                sizeBytes: inspected.sizeBytes,
                checksum: inspected.checksum,
              },
              correlationId: request.correlationId,
            },
          });
          await storage.promote(keys.stagingKey, keys.storageKey);
          return presentImage(image, request.auth, cycle.id);
        },
      });
      if (result.replayed) {
        await Promise.allSettled([storage.remove(keys.stagingKey), storage.remove(keys.storageKey)]);
      }
      return result;
    } catch (error) {
      await Promise.allSettled([storage.remove(keys.stagingKey), storage.remove(keys.storageKey)]);
      throw error;
    }
  },

  async content(actor, imageId) {
    const image = await findVisibleImage(prisma, actor, imageId);
    if (image.deletedAt) throw missingImage();
    try {
      return {
        body: await storage.read(image.storageKey),
        mimeType: image.mimeType,
        sizeBytes: Number(image.sizeBytes),
        fileName: `${image.id}.${image.mimeType === 'image/jpeg' ? 'jpg' : image.mimeType.split('/')[1]}`,
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new AppError(503, 'IMAGE_STORAGE_UNAVAILABLE', 'O conteÃºdo da imagem estÃ¡ temporariamente indisponÃ­vel.');
      }
      throw error;
    }
  },

  async remove(request, imageId, input, key) {
    return executeIdempotent(prisma, {
      actorId: request.auth.userId,
      key,
      payload: { imageId, ...input },
      operation: async (tx) => {
        const visible = await findVisibleImage(tx, request.auth, imageId);
        const { cycle } = await lockCurrentCycle(tx, visible.cycle.taskId);
        requireExpectedVersion(cycle, input.expectedVersion);
        const image = await tx.taskImage.findUnique({ where: { id: imageId } });
        if (!image || image.deletedAt) throw conflict('IMAGE_ALREADY_REMOVED', 'A imagem jÃ¡ foi removida.');
        if (image.uploadedById !== request.auth.userId) {
          throw new AppError(403, 'IMAGE_DELETE_FORBIDDEN', 'Somente o autor pode remover esta imagem.');
        }
        if (image.cycleId !== cycle.id) {
          throw conflict('IMAGE_CYCLE_CLOSED', 'Imagens de ciclos histÃ³ricos nÃ£o podem ser removidas.');
        }
        const deletedAt = new Date();
        await tx.taskImage.update({ where: { id: image.id }, data: { deletedAt } });
        await tx.auditEvent.create({
          data: {
            id: randomUUID(),
            actorId: request.auth.userId,
            entityType: 'TaskImage',
            entityId: image.id,
            action: 'TASK_IMAGE_REMOVED',
            beforeJson: { deletedAt: null },
            afterJson: { deletedAt, taskId: visible.cycle.taskId, cycleId: image.cycleId },
            reason: input.reason,
            correlationId: request.correlationId,
          },
        });
        return { id: image.id, deletedAt };
      },
    });
  },
});
