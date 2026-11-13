import { Router } from 'express';
import multer from 'multer';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { AppError } from '../../shared/errors/app-error.js';
import { runCriticalTransaction } from '../../infrastructure/database/transaction.js';
import { createAttachmentStorage } from './attachment.storage.js';
import { createAttachmentService } from './attachment.service.js';
const root = path.join(tmpdir(), 'seaf-uploads');
const receive = (max) => {
  const up = multer({
    storage: multer.diskStorage({
      destination: async (_r, _f, done) => {
        try { done(null, await mkdtemp(`${root}-`)); } catch (error) { done(error); }
      },
      filename: (_r, _f, done) => done(null, randomUUID()),
    }),
    limits: { files: 1, fields: 2, fileSize: max },
  }).single('attachment');
  return (req, res, next) => up(req, res, (error) => next(error ? new AppError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.code === 'LIMIT_FILE_SIZE' ? 'ATTACHMENT_TECHNICAL_LIMIT' : 'INVALID_ATTACHMENT_UPLOAD', 'Upload de anexo inválido.') : undefined));
};
const claimExecutionSchema = z.object({
  body: z.object({ stagedIds: z.array(z.string().uuid()).max(1000).default([]), expectedVersion: z.number().int().nonnegative() }),
  params: z.object({ id: z.string().uuid() }),
});
export const createAttachmentRouter = ({ prisma, config }) => {
  const router = Router();
  const storage = createAttachmentStorage(config.attachmentStoragePath ?? config.imageStoragePath);
  const service = createAttachmentService({ prisma, storage, ttlMinutes: config.attachmentStagingTtlMinutes });
  router.use(authenticate({ prisma, config }));
  router.post('/staged', receive(config.attachmentTechnicalMaxBytes), asyncHandler(async (req, res) => {
    try {
      const upload = await service.stage(req, req.file);
      res.status(201).json({ data: { id: upload.id, originalName: upload.originalName, mimeType: upload.mimeType, sizeBytes: Number(upload.sizeBytes), expiresAt: upload.expiresAt } });
    } finally {
      await service.discardTemporary(req.file);
    }
  }));
  router.post('/tasks/:id/attachments', validate(claimExecutionSchema), asyncHandler(async (req, res) => {
    const { id: taskId } = req.validated.params;
    const { stagedIds, expectedVersion } = req.validated.body;
    const claims = await runCriticalTransaction(prisma, async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { id: true, teamId: true, currentCycleId: true } });
      if (!task?.currentCycleId) throw new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada.');
      const roleCode = req.auth.roleCode;
      if (roleCode !== 'ADMIN_MASTER' && roleCode !== 'SECRETARY') {
        if (roleCode === 'MANAGER') {
          const isManager = Boolean(await tx.teamManager.findFirst({ where: { teamId: task.teamId, userId: req.auth.userId, endedAt: null } }));
          if (!isManager) throw new AppError(403, 'ATTACHMENT_UPLOAD_FORBIDDEN', 'Sem permissão para enviar anexos a esta tarefa.');
        } else {
          const isAssigned = Boolean(await tx.taskAssignment.findFirst({ where: { cycleId: task.currentCycleId, userId: req.auth.userId, endedAt: null } }));
          if (!isAssigned) throw new AppError(403, 'ATTACHMENT_UPLOAD_FORBIDDEN', 'Sem permissão para enviar anexos a esta tarefa.');
        }
      }
      const cycle = await tx.taskCycle.findUnique({ where: { id: task.currentCycleId } });
      if (!cycle || cycle.closedAt) throw new AppError(409, 'TASK_CYCLE_CLOSED', 'O ciclo atual já foi encerrado.');
      if (cycle.version !== expectedVersion) throw new AppError(409, 'TASK_VERSION_CONFLICT', 'A tarefa foi alterada por outra pessoa.');
      if (cycle.status !== 'IN_PROGRESS') throw new AppError(422, 'ATTACHMENT_EXECUTION_REQUIRES_IN_PROGRESS', 'Anexos de execução exigem ciclo em andamento.');
      const claimed = await service.claimExecution(tx, req.auth.userId, cycle.id, stagedIds);
      await tx.auditEvent.create({ data: { id: randomUUID(), actorId: req.auth.userId, entityType: 'TaskAttachment', entityId: cycle.id, action: 'TASK_ATTACHMENT_EXECUTION_UPLOADED', afterJson: { taskId, cycleId: cycle.id, attachmentCount: claimed.length, origin: 'EXECUTION' }, correlationId: req.correlationId } });
      return claimed;
    });
    try { await service.promoteClaimed(claims); } catch (error) { console.error(JSON.stringify({ event: 'attachment_execution_promotion_failed', taskId, error: error.message, timestamp: new Date().toISOString() })); }
    res.status(201).json({ data: { attachments: claims.map((c) => ({ id: c.attachment.id, originalName: c.attachment.originalName, mimeType: c.attachment.mimeType, sizeBytes: Number(c.attachment.sizeBytes), origin: c.attachment.origin })) } });
  }));
  router.get('/tasks/:id', asyncHandler(async (req, res) => res.json({ data: { attachments: await service.list(req.auth, req.params.id) } })));
  router.get('/:id/content', asyncHandler(async (req, res) => {
    const { attachment, stream } = await service.content(req.auth, req.params.id);
    res.type(attachment.mimeType);
    res.setHeader('content-disposition', `attachment; filename="${encodeURIComponent(attachment.originalName)}"`);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }));
  router.delete('/:id', asyncHandler(async (req, res) => res.json({ data: await service.remove(req, req.params.id) })));
  return router;
};
