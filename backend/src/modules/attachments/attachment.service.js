import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { AppError } from '../../shared/errors/app-error.js';
import { inspectAttachment } from './attachment.validation.js';

const notFound = () => new AppError(404, 'ATTACHMENT_NOT_FOUND', 'Anexo não encontrado.');
const conflict = (code, message) => new AppError(409, code, message);
const visible = async (db, actor, task) => {
  if (['ADMIN_MASTER', 'SECRETARY'].includes(actor.roleCode)) return true;
  if (actor.roleCode === 'MANAGER') return Boolean(await db.teamManager.findFirst({ where: { teamId: task.teamId, userId: actor.userId, endedAt: null } }));
  return Boolean(await db.taskAssignment.findFirst({ where: { cycleId: task.currentCycleId, userId: actor.userId, endedAt: null } }));
};
const taskFor = async (db, actor, taskId) => { const task = await db.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { id: true, teamId: true, currentCycleId: true } }); if (!task?.currentCycleId || !(await visible(db, actor, task))) throw notFound(); return task; };

export const createAttachmentService = ({ prisma, storage, ttlMinutes }) => ({
  async stage(request, file) {
    const inspected = await inspectAttachment(file); const keys = storage.createKeys(inspected.extension);
    await storage.moveFromTemporary(file.path, keys.stagingKey);
    try { return await prisma.stagedUpload.create({ data: { id: randomUUID(), uploadedById: request.auth.userId, originalName: inspected.originalName, stagingKey: keys.stagingKey, mimeType: inspected.mimeType, sizeBytes: BigInt(inspected.sizeBytes), checksum: inspected.checksum, expiresAt: new Date(Date.now() + ttlMinutes * 60000) } }); }
    catch (error) { await storage.remove(keys.stagingKey); throw error; }
  },
  async claimInitial(tx, actorId, cycleId, stagedIds) {
    if (!stagedIds?.length) return [];
    const now = new Date(); const rows = await tx.stagedUpload.findMany({ where: { id: { in: stagedIds }, uploadedById: actorId, status: 'STAGED', expiresAt: { gt: now } } });
    if (rows.length !== new Set(stagedIds).size) throw conflict('STAGED_UPLOAD_UNAVAILABLE', 'Um ou mais anexos não pertencem ao usuário, expiraram ou já foram utilizados.');
    const attachments = await Promise.all(rows.map((row) => { const keys = storage.createKeys(row.originalName.slice(row.originalName.lastIndexOf('.'))); return tx.taskAttachment.create({ data: { id: randomUUID(), cycleId, uploadedById: actorId, origin: 'INITIAL', originalName: row.originalName, storageKey: keys.storageKey, mimeType: row.mimeType, sizeBytes: row.sizeBytes, checksum: row.checksum } }).then((attachment) => ({ attachment, staged: row })); }));
    const claimed = await tx.stagedUpload.updateMany({ where: { id: { in: rows.map((row) => row.id) }, status: 'STAGED' }, data: { status: 'CLAIMED', claimedAt: now } });
    if (claimed.count !== rows.length) throw conflict('STAGED_UPLOAD_CONFLICT', 'Um anexo foi reivindicado por outra operação.');
    return attachments;
  },
  async claimExecution(tx, actorId, cycleId, stagedIds) {
    if (!stagedIds?.length) return [];
    const now = new Date(); const rows = await tx.stagedUpload.findMany({ where: { id: { in: stagedIds }, uploadedById: actorId, status: 'STAGED', expiresAt: { gt: now } } });
    if (rows.length !== new Set(stagedIds).size) throw conflict('STAGED_UPLOAD_UNAVAILABLE', 'Um ou mais anexos não pertencem ao usuário, expiraram ou já foram utilizados.');
    const attachments = await Promise.all(rows.map((row) => { const keys = storage.createKeys(row.originalName.slice(row.originalName.lastIndexOf('.'))); return tx.taskAttachment.create({ data: { id: randomUUID(), cycleId, uploadedById: actorId, origin: 'EXECUTION', originalName: row.originalName, storageKey: keys.storageKey, mimeType: row.mimeType, sizeBytes: row.sizeBytes, checksum: row.checksum } }).then((attachment) => ({ attachment, staged: row })); }));
    const claimed = await tx.stagedUpload.updateMany({ where: { id: { in: rows.map((row) => row.id) }, status: 'STAGED' }, data: { status: 'CLAIMED', claimedAt: now } });
    if (claimed.count !== rows.length) throw conflict('STAGED_UPLOAD_CONFLICT', 'Um anexo foi reivindicado por outra operação.');
    return attachments;
  },
  async promoteClaimed(claims) { for (const { attachment, staged } of claims) await storage.promote(staged.stagingKey, attachment.storageKey); },
  async reconcilePromotions() {
    const claimed = await prisma.stagedUpload.findMany({ where: { status: 'CLAIMED' } });
    const reconciled = [];
    for (const row of claimed) {
      const exists = await prisma.taskAttachment.findFirst({ where: { checksum: row.checksum, uploadedById: row.uploadedById } });
      if (exists) {
        await prisma.stagedUpload.update({ where: { id: row.id }, data: { status: 'EXPIRED' } });
        reconciled.push({ stagedId: row.id, promoted: true, attachmentId: exists.id });
      } else {
        const stagingPath = storage.resolve ? storage.resolve(row.stagingKey) : null;
        if (stagingPath) {
          try { await rm(stagingPath, { force: true }); } catch { /* staging já removido */ }
        }
        await prisma.stagedUpload.update({ where: { id: row.id }, data: { status: 'EXPIRED' } });
        reconciled.push({ stagedId: row.id, promoted: false, reason: 'staging_removed_or_missing' });
      }
    }
    return reconciled;
  },
  async list(actor, taskId) { const task = await taskFor(prisma, actor, taskId); return prisma.taskAttachment.findMany({ where: { cycle: { taskId: task.id }, deletedAt: null }, orderBy: { createdAt: 'asc' }, include: { uploadedBy: { select: { id: true, name: true } }, cycle: { select: { cycleNumber: true } } } }); },
  async content(actor, attachmentId) { const attachment = await prisma.taskAttachment.findUnique({ where: { id: attachmentId }, include: { cycle: { include: { task: true } } } }); if (!attachment || attachment.deletedAt || !(await visible(prisma, actor, attachment.cycle.task))) throw notFound(); return { attachment, stream: storage.stream(attachment.storageKey) }; },
  async remove(request, attachmentId) { const attachment = await prisma.taskAttachment.findUnique({ where: { id: attachmentId }, include: { cycle: { include: { task: true } } } }); if (!attachment || attachment.deletedAt || !(await visible(prisma, request.auth, attachment.cycle.task))) throw notFound(); if (attachment.uploadedById !== request.auth.userId && !['ADMIN_MASTER', 'SECRETARY'].includes(request.auth.roleCode)) throw new AppError(403, 'ATTACHMENT_DELETE_FORBIDDEN', 'Sem permissão para remover este anexo.'); const deletedAt = new Date(); await prisma.$transaction(async (tx) => { await tx.taskAttachment.update({ where: { id: attachment.id }, data: { deletedAt } }); await tx.auditEvent.create({ data: { id: randomUUID(), actorId: request.auth.userId, entityType: 'TaskAttachment', entityId: attachment.id, action: 'TASK_ATTACHMENT_DELETED', reason: request.body?.reason ?? null, correlationId: request.correlationId } }); }); return { id: attachment.id, deletedAt }; },
  async cleanup() { const now = new Date(); const expired = await prisma.stagedUpload.findMany({ where: { status: 'STAGED', expiresAt: { lte: now } } }); for (const row of expired) { const changed = await prisma.stagedUpload.updateMany({ where: { id: row.id, status: 'STAGED', expiresAt: { lte: now } }, data: { status: 'EXPIRED' } }); if (changed.count) await storage.remove(row.stagingKey); } return expired.length; },
  async scheduleCleanup(intervalMs = 600_000) {
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        const cleaned = await this.cleanup();
        const reconciled = await this.reconcilePromotions();
        if (cleaned > 0 || reconciled.length > 0) {
          console.info(JSON.stringify({ event: 'attachment_cleanup', expired: cleaned, reconciled: reconciled.length, timestamp: new Date().toISOString() }));
        }
      } catch (error) {
        console.error(JSON.stringify({ event: 'attachment_cleanup_error', type: error.name ?? 'Error', message: error.message, timestamp: new Date().toISOString() }));
      } finally {
        running = false;
      }
    };
    const timer = setInterval(run, intervalMs);
    timer.unref();
    return { stop: () => clearInterval(timer), runOnce: run };
  },
  async discardTemporary(file) { if (file?.destination) await rm(file.destination, { recursive: true, force: true }); },
});
