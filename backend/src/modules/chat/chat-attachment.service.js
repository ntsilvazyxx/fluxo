import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { AppError } from '../../shared/errors/app-error.js';
import { runCriticalTransaction } from '../../infrastructure/database/transaction.js';
import { canSendMessage } from './chat.policy.js';
import { presentStagedChatAttachment } from './chat-attachment.presenter.js';
import { CHAT_ATTACHMENT_SCAN_RESULTS, assertChatAttachmentScanner } from './chat-attachment-scanner.js';
import { assertChatAttachmentStorage } from './chat-attachment-storage.contract.js';
import { inspectChatAttachment } from './chat-attachment.validation.js';

const ACTIVE_QUOTA_STATUSES = ['STAGED', 'READY', 'CLAIMED'];
const IMMUTABLE_STATES = ['CLAIMED', 'PROMOTED'];

const requireEnabled = (enabled) => {
  if (!enabled) throw new AppError(503, 'CHAT_ATTACHMENTS_DISABLED', 'Uploads do Chat estão desabilitados.');
};

const loadContext = async (client, actor, taskId) => {
  const task = await client.task.findUnique({
    where: { id: taskId, deletedAt: null },
    include: { team: { include: { managers: { where: { endedAt: null } } } } },
  });
  if (!task) throw new AppError(404, 'TASK_NOT_FOUND', 'Tarefa não encontrada.');
  const conversation = await client.chatConversation.findUnique({ where: { taskId }, include: { lockState: true } });
  if (!conversation) throw new AppError(404, 'CHAT_NOT_INITIALIZED', 'O chat desta tarefa ainda não foi inicializado.');
  const participant = await client.chatParticipant.findUnique({
    where: { conversationId_userId: { conversationId: conversation.id, userId: actor.userId } },
    include: { periods: { where: { endedAt: null } } },
  });
  if (!canSendMessage(actor, task, conversation, conversation.lockState, participant)) {
    if (conversation.lockState?.isLocked) throw new AppError(423, 'CHAT_LOCKED', 'O chat desta tarefa está temporariamente bloqueado.');
    throw new AppError(403, 'FORBIDDEN', 'Participação ativa é obrigatória para enviar anexos.');
  }
  return { task, conversation, participant };
};

const ensureReplay = (existing, metadata, now) => {
  if (existing.sha256 !== metadata.sha256 || Number(existing.sizeBytes) !== metadata.sizeBytes) {
    throw new AppError(409, 'UPLOAD_IDEMPOTENCY_CONFLICT', 'O clientUploadId já foi usado com conteúdo diferente.');
  }
  if (existing.expiresAt <= now || ['EXPIRED', 'REJECTED', 'FAILED'].includes(existing.status)) {
    throw new AppError(409, 'UPLOAD_NOT_REPLAYABLE', 'O upload anterior não pode ser reativado.');
  }
  return presentStagedChatAttachment(existing);
};

export function createChatAttachmentService({
  prisma, storage, scanner, enabled = false, ttlMinutes = 1440,
  maxBytes = 20 * 1024 * 1024, userQuotaBytes, conversationQuotaBytes,
  inspect = inspectChatAttachment, now = () => new Date(), id = randomUUID,
}) {
  assertChatAttachmentStorage(storage);
  assertChatAttachmentScanner(scanner);
  if (!Number.isSafeInteger(userQuotaBytes) || userQuotaBytes <= 0
    || !Number.isSafeInteger(conversationQuotaBytes) || conversationQuotaBytes <= 0) {
    throw new TypeError('Quotas finitas de staging por usuário e conversa são obrigatórias.');
  }

  const stage = async (actor, taskId, clientUploadId, file, correlationId = randomUUID()) => {
    requireEnabled(enabled);
    const initial = await loadContext(prisma, actor, taskId);
    const metadata = await inspect(file, { maxBytes });
    const existing = await prisma.chatAttachmentUpload.findUnique({
      where: { conversationId_uploadedById_clientUploadId: {
        conversationId: initial.conversation.id, uploadedById: actor.userId, clientUploadId,
      } },
    });
    if (existing) return ensureReplay(existing, metadata, now());
    if (!await scanner.isAvailable()) throw new AppError(503, 'CHAT_ATTACHMENT_SCANNER_UNAVAILABLE', 'Scanner de segurança indisponível.');
    let scan;
    try { scan = await scanner.scanFile(file.path); } catch {
      throw new AppError(503, 'CHAT_ATTACHMENT_SCAN_FAILED', 'Não foi possível verificar o arquivo.');
    }
    if (scan?.result !== CHAT_ATTACHMENT_SCAN_RESULTS.CLEAN) {
      throw new AppError(422, 'CHAT_ATTACHMENT_REJECTED', 'O arquivo não foi aprovado na verificação de segurança.');
    }

    const stagingKey = storage.createStagingKey();
    const targetStorageKey = storage.createObjectKey();
    const physical = await storage.writeStaging(createReadStream(file.path), { key: stagingKey, maxBytes });
    if (physical.sha256 !== metadata.sha256 || physical.sizeBytes !== metadata.sizeBytes) {
      await storage.quarantine(stagingKey, physical).catch(() => undefined);
      throw new AppError(422, 'CHAT_ATTACHMENT_INTEGRITY_FAILURE', 'A integridade do upload não pôde ser confirmada.');
    }

    try {
      return await runCriticalTransaction(prisma, async (tx) => {
        if (typeof tx.$queryRawUnsafe === 'function') {
          await tx.$queryRawUnsafe('SELECT id FROM chat_conversations WHERE id = ? FOR UPDATE', initial.conversation.id);
        }
        await loadContext(tx, actor, taskId);
        const replay = await tx.chatAttachmentUpload.findUnique({
          where: { conversationId_uploadedById_clientUploadId: {
            conversationId: initial.conversation.id, uploadedById: actor.userId, clientUploadId,
          } },
        });
        if (replay) return { replay: ensureReplay(replay, metadata, now()) };
        const quotaWhere = { status: { in: ACTIVE_QUOTA_STATUSES }, expiresAt: { gt: now() } };
        const [userUsage, conversationUsage] = await Promise.all([
          tx.chatAttachmentUpload.aggregate({ where: { ...quotaWhere, uploadedById: actor.userId }, _sum: { sizeBytes: true } }),
          tx.chatAttachmentUpload.aggregate({ where: { ...quotaWhere, conversationId: initial.conversation.id }, _sum: { sizeBytes: true } }),
        ]);
        if (Number(userUsage._sum.sizeBytes ?? 0) + metadata.sizeBytes > userQuotaBytes
          || Number(conversationUsage._sum.sizeBytes ?? 0) + metadata.sizeBytes > conversationQuotaBytes) {
          throw new AppError(429, 'CHAT_ATTACHMENT_QUOTA_EXCEEDED', 'Quota temporária de anexos excedida.');
        }
        const createdAt = now();
        const created = await tx.chatAttachmentUpload.create({ data: {
          id: id(), conversationId: initial.conversation.id, uploadedById: actor.userId,
          clientUploadId, messageId: null, originalName: metadata.originalName,
          stagingKey, targetStorageKey, mimeType: metadata.mimeType, extension: metadata.extension,
          sizeBytes: BigInt(metadata.sizeBytes), sha256: metadata.sha256, status: 'READY',
          expiresAt: new Date(createdAt.getTime() + ttlMinutes * 60_000), attemptCount: 1,
        } });
        if (tx.auditEvent?.create) await tx.auditEvent.create({ data: {
          id: id(), actorId: actor.userId, entityType: 'ChatAttachmentUpload', entityId: created.id,
          action: 'CHAT_ATTACHMENT_STAGED', afterJson: { taskId, conversationId: initial.conversation.id, sizeBytes: metadata.sizeBytes, mimeType: metadata.mimeType },
          correlationId,
        } });
        return { created: presentStagedChatAttachment(created) };
      }).then(async (result) => {
        if (result.replay) await storage.removeTemporary(stagingKey).catch(() => undefined);
        return result.replay ?? result.created;
      });
    } catch (error) {
      await storage.removeTemporary(stagingKey).catch(() => undefined);
      throw error;
    }
  };

  const get = async (actor, taskId, uploadId) => {
    requireEnabled(enabled);
    const context = await loadContext(prisma, actor, taskId);
    const upload = await prisma.chatAttachmentUpload.findUnique({ where: { id: uploadId } });
    if (!upload || upload.conversationId !== context.conversation.id || upload.uploadedById !== actor.userId) {
      throw new AppError(404, 'CHAT_ATTACHMENT_UPLOAD_NOT_FOUND', 'Upload temporário não encontrado.');
    }
    return presentStagedChatAttachment(upload);
  };

  const cancel = async (actor, taskId, uploadId, correlationId = randomUUID()) => {
    requireEnabled(enabled);
    const context = await loadContext(prisma, actor, taskId);
    const upload = await prisma.chatAttachmentUpload.findUnique({ where: { id: uploadId } });
    if (!upload || upload.conversationId !== context.conversation.id || upload.uploadedById !== actor.userId) {
      throw new AppError(404, 'CHAT_ATTACHMENT_UPLOAD_NOT_FOUND', 'Upload temporário não encontrado.');
    }
    if (IMMUTABLE_STATES.includes(upload.status)) throw new AppError(409, 'CHAT_ATTACHMENT_ALREADY_CLAIMED', 'Upload já reivindicado.');
    if (upload.status === 'EXPIRED' && upload.failureCode === 'CANCELLED_BY_USER') return presentStagedChatAttachment(upload);
    if (['STAGED', 'READY'].includes(upload.status)) await storage.removeTemporary(upload.stagingKey);
    const updated = await prisma.chatAttachmentUpload.update({ where: { id: upload.id }, data: {
      status: 'EXPIRED', failedAt: now(), failureCode: 'CANCELLED_BY_USER',
    } });
    if (prisma.auditEvent?.create) await prisma.auditEvent.create({ data: {
      id: id(), actorId: actor.userId, entityType: 'ChatAttachmentUpload', entityId: upload.id,
      action: 'CHAT_ATTACHMENT_STAGING_CANCELLED', afterJson: { taskId }, correlationId,
    } });
    return presentStagedChatAttachment(updated);
  };

  return { stage, get, cancel };
}
