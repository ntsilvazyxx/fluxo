import { randomUUID } from 'node:crypto';
import { runCriticalTransaction } from '../../infrastructure/database/transaction.js';

export const CHAT_RECONCILIATION_ACTIONS = Object.freeze({
  MESSAGE_RECONCILED: 'CHAT_MESSAGE_RECONCILED',
  RECONCILIATION_FAILED: 'CHAT_RECONCILIATION_FAILED',
  STAGING_EXPIRED: 'CHAT_ATTACHMENT_STAGING_EXPIRED',
  ORPHAN_DETECTED: 'CHAT_ORPHAN_DETECTED',
  INTEGRITY_MISMATCH: 'CHAT_INTEGRITY_MISMATCH',
});

const DEFAULT_LEASE_DURATION_MS = 300_000; // 5 minutos
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_STAGING_GRACE_PERIOD_MS = 3_600_000; // 1 hora
const DEFAULT_QUARANTINE_RETENTION_MS = 30 * 24 * 3_600_000; // 30 dias

export function createChatAttachmentReconciliationService({
  prisma,
  storage = null,
  now = () => new Date(),
  id = randomUUID,
  workerToken: defaultWorkerToken = randomUUID(),
  leaseDurationMs = DEFAULT_LEASE_DURATION_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  stagingGracePeriodMs = DEFAULT_STAGING_GRACE_PERIOD_MS,
  quarantineRetentionMs = DEFAULT_QUARANTINE_RETENTION_MS,
} = {}) {
  if (!prisma) throw new TypeError('prisma é obrigatório para o serviço de reconciliação.');

  const logAudit = async (client, {
    entityType,
    entityId,
    action,
    beforeJson = null,
    afterJson = null,
    reason = null,
    correlationId = null,
  }) => {
    try {
      if (typeof client.auditEvent?.create === 'function') {
        await client.auditEvent.create({
          data: {
            id: id(),
            entityType,
            entityId,
            action,
            beforeJson,
            afterJson,
            reason,
            correlationId: correlationId || id(),
            createdAt: now(),
          },
        });
      }
    } catch {
      // Auditoria não pode interromper silenciosamente nem quebrar a integridade
    }
  };

  const acquireMessageLease = async (messageId, {
    workerToken = defaultWorkerToken,
    durationMs = leaseDurationMs,
  } = {}) => {
    const currentTime = now();
    const expiresAt = new Date(currentTime.getTime() + durationMs);

    if (typeof prisma.$executeRaw === 'function') {
      const affectedRows = await prisma.$executeRaw`
        UPDATE chat_messages
        SET reconciliationClaimToken = ${workerToken},
            reconciliationClaimedAt = ${currentTime},
            reconciliationClaimExpiresAt = ${expiresAt},
            reconciliationAttempts = reconciliationAttempts + 1
        WHERE id = ${messageId}
          AND status = 'PENDING'
          AND (reconciliationClaimExpiresAt IS NULL OR reconciliationClaimExpiresAt < ${currentTime})
      `;
      return affectedRows > 0;
    }

    // Fallback para mock/ambiente sem raw query (e.g. testes unitários isolados com mocks parciais)
    const existing = await prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!existing || existing.status !== 'PENDING') return false;
    if (existing.reconciliationClaimExpiresAt && existing.reconciliationClaimExpiresAt >= currentTime) {
      return false;
    }

    await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        reconciliationClaimToken: workerToken,
        reconciliationClaimedAt: currentTime,
        reconciliationClaimExpiresAt: expiresAt,
        reconciliationAttempts: { increment: 1 },
      },
    });
    return true;
  };

  const reconcileSingleMessage = async (messageRecord, {
    workerToken = defaultWorkerToken,
    dryRun = false,
  } = {}) => {
    const messageId = messageRecord.id;
    const currentTime = now();

    // 1. Obter uploads vinculados à mensagem
    const uploads = await prisma.chatAttachmentUpload.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' },
    });

    // 2. Se a mensagem não possui anexos pendentes, finalizar diretamente para PUBLISHED
    if (uploads.length === 0) {
      if (dryRun) {
        return { status: 'WOULD_RECONCILE', messageId, attachmentCount: 0 };
      }

      try {
        await runCriticalTransaction(prisma, async (tx) => {
          const current = await tx.chatMessage.findUnique({ where: { id: messageId } });
          if (!current || current.status !== 'PENDING') {
            throw new Error('MESSAGE_NOT_PENDING');
          }
          if (current.reconciliationClaimToken && current.reconciliationClaimToken !== workerToken) {
            throw new Error('LEASE_LOST: O lease da mensagem pertence a outro worker.');
          }

          await tx.chatMessage.update({
            where: { id: messageId },
            data: {
              status: 'PUBLISHED',
              publishedAt: currentTime,
              failureReason: null,
              reconciliationClaimToken: null,
              reconciliationClaimExpiresAt: null,
            },
          });

          await logAudit(tx, {
            entityType: 'CHAT_MESSAGE',
            entityId: messageId,
            action: CHAT_RECONCILIATION_ACTIONS.MESSAGE_RECONCILED,
            beforeJson: { status: 'PENDING', attachments: 0 },
            afterJson: { status: 'PUBLISHED', attachments: 0 },
            reason: 'Mensagem sem anexos publicada pela reconciliação.',
            correlationId: workerToken,
          });
        });
      } catch (err) {
        if (err.message?.includes('LEASE_LOST')) {
          return { status: 'LEASE_CONFLICT', messageId, reason: err.message };
        }
        throw err;
      }

      return { status: 'RECONCILED', messageId, attachmentCount: 0 };
    }

    // 3. Verificar estado físico de cada upload
    const verifiedUploads = [];
    for (const upload of uploads) {
      const targetStorageKey = upload.targetStorageKey
        || (storage?.createObjectKey ? storage.createObjectKey() : `objects/${upload.id.slice(0, 2)}/${upload.id}.object`);

      let objectVerified;

      // 3.1. Verificar se o destino definitivo já existe
      if (storage) {
        const objectExists = await storage.exists(targetStorageKey);
        if (objectExists) {
          const head = await storage.head(targetStorageKey, { includeSha256: true });
          if (Number(head.sizeBytes) !== Number(upload.sizeBytes) || head.sha256.toLowerCase() !== upload.sha256.toLowerCase()) {
            await logAudit(prisma, {
              entityType: 'CHAT_ATTACHMENT_UPLOAD',
              entityId: upload.id,
              action: CHAT_RECONCILIATION_ACTIONS.INTEGRITY_MISMATCH,
              reason: 'Divergência de hash ou tamanho no objeto definitivo durante reconciliação.',
              correlationId: workerToken,
            });
            return {
              status: 'INTEGRITY_MISMATCH',
              messageId,
              uploadId: upload.id,
              reason: 'SHA-256 ou tamanho divergente no storage definitivo.',
            };
          }
          objectVerified = true;
        } else {
          // 3.2. Se não está em objects, verificar staging
          const stagingExists = await storage.exists(upload.stagingKey);
          if (!stagingExists) {
            return {
              status: 'MISSING_FILE',
              messageId,
              uploadId: upload.id,
              reason: 'Arquivo ausente em staging e no storage definitivo.',
            };
          }

          const stagingHead = await storage.head(upload.stagingKey, { includeSha256: true });
          if (Number(stagingHead.sizeBytes) !== Number(upload.sizeBytes) || stagingHead.sha256.toLowerCase() !== upload.sha256.toLowerCase()) {
            await logAudit(prisma, {
              entityType: 'CHAT_ATTACHMENT_UPLOAD',
              entityId: upload.id,
              action: CHAT_RECONCILIATION_ACTIONS.INTEGRITY_MISMATCH,
              reason: 'Divergência de integridade no arquivo de staging.',
              correlationId: workerToken,
            });
            return {
              status: 'INTEGRITY_MISMATCH',
              messageId,
              uploadId: upload.id,
              reason: 'SHA-256 ou tamanho divergente em staging.',
            };
          }

          if (!dryRun) {
            // Promover staging para destino definitivo
            await storage.promote(upload.stagingKey, targetStorageKey, {
              sizeBytes: upload.sizeBytes,
              sha256: upload.sha256,
            });
            const verified = await storage.exists(targetStorageKey);
            if (!verified) {
              return {
                status: 'PROMOTION_FAILED',
                messageId,
                uploadId: upload.id,
                reason: 'Falha ao confirmar objeto definitivo após promoção.',
              };
            }
          }
          objectVerified = true;
        }
      } else {
        objectVerified = true;
      }

      verifiedUploads.push({
        ...upload,
        targetStorageKey,
        physicallyVerified: objectVerified,
      });
    }

    if (dryRun) {
      return {
        status: 'WOULD_RECONCILE',
        messageId,
        attachmentCount: verifiedUploads.length,
      };
    }

    // 4. Finalização transacional idêntica à Fase 5.1.3 com revalidação estrita do lease
    try {
      await runCriticalTransaction(prisma, async (tx) => {
        const current = await tx.chatMessage.findUnique({ where: { id: messageId } });
        if (!current || current.status !== 'PENDING') {
          throw new Error('MESSAGE_NOT_PENDING');
        }
        if (current.reconciliationClaimToken && current.reconciliationClaimToken !== workerToken) {
          throw new Error('LEASE_LOST: O lease de reconciliação pertence a outro worker.');
        }

        const existingAttachments = await tx.chatMessageAttachment.findMany({
          where: { messageId },
        });

        if (!existingAttachments.length) {
          for (let position = 0; position < verifiedUploads.length; position++) {
            const upload = verifiedUploads[position];
            await tx.chatMessageAttachment.create({
              data: {
                id: id(),
                messageId,
                sourceUploadId: upload.id,
                uploadedById: upload.uploadedById,
                position,
                originalName: upload.originalName,
                storagePath: upload.targetStorageKey,
                mimeType: upload.mimeType,
                sizeBytes: upload.sizeBytes,
                sha256: upload.sha256,
                origin: 'UPLOAD',
              },
            });

            await tx.chatAttachmentUpload.update({
              where: { id: upload.id },
              data: {
                status: 'PROMOTED',
                promotedAt: currentTime,
                targetStorageKey: upload.targetStorageKey,
              },
            });
          }
        }

        await tx.chatMessage.update({
          where: { id: messageId },
          data: {
            status: 'PUBLISHED',
            publishedAt: currentTime,
            failureReason: null,
            reconciliationClaimToken: null,
            reconciliationClaimExpiresAt: null,
          },
        });

        await logAudit(tx, {
          entityType: 'CHAT_MESSAGE',
          entityId: messageId,
          action: CHAT_RECONCILIATION_ACTIONS.MESSAGE_RECONCILED,
          beforeJson: { status: 'PENDING' },
          afterJson: { status: 'PUBLISHED', attachmentCount: verifiedUploads.length },
          reason: 'Mensagem e anexos reconciliados e publicados com sucesso.',
          correlationId: workerToken,
        });
      });
    } catch (err) {
      if (err.message?.includes('LEASE_LOST')) {
        return { status: 'LEASE_CONFLICT', messageId, reason: err.message };
      }
      throw err;
    }

    return {
      status: 'RECONCILED',
      messageId,
      attachmentCount: verifiedUploads.length,
    };
  };

  const reconcilePendingMessages = async ({
    dryRun = false,
    limit = 50,
    workerToken = defaultWorkerToken,
  } = {}) => {
    const currentTime = now();
    const results = [];

    const candidates = await prisma.chatMessage.findMany({
      where: {
        status: 'PENDING',
        OR: [
          { reconciliationClaimExpiresAt: null },
          { reconciliationClaimExpiresAt: { lt: currentTime } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    for (const candidate of candidates) {
      if (candidate.reconciliationAttempts >= maxAttempts) {
        if (dryRun) {
          results.push({
            status: 'WOULD_SIGNAL_MANUAL_REVIEW',
            messageId: candidate.id,
            attempts: candidate.reconciliationAttempts,
          });
          continue;
        }

        // NÃO TRANSFORMAR FALHA TRANSITÓRIA EM ENCERRAMENTO DEFINITIVO!
        // A mensagem permanece PENDING, o lease é liberado e o evento é auditado para intervenção manual.
        await runCriticalTransaction(prisma, async (tx) => {
          await tx.chatMessage.update({
            where: { id: candidate.id },
            data: {
              reconciliationClaimToken: null,
              reconciliationClaimExpiresAt: null,
            },
          });

          await logAudit(tx, {
            entityType: 'CHAT_MESSAGE',
            entityId: candidate.id,
            action: CHAT_RECONCILIATION_ACTIONS.RECONCILIATION_FAILED,
            beforeJson: { status: 'PENDING', attempts: candidate.reconciliationAttempts },
            afterJson: { status: 'PENDING', flaggedForManualReview: true },
            reason: 'Limite de tentativas de reconciliação atingido sem confirmação de falha permanente. Mensagem preservada como PENDING para intervenção manual.',
            correlationId: workerToken,
          });
        });

        results.push({
          status: 'MAX_ATTEMPTS_EXCEEDED_PRESERVED',
          messageId: candidate.id,
          attempts: candidate.reconciliationAttempts,
        });
        continue;
      }

      if (!dryRun) {
        const acquired = await acquireMessageLease(candidate.id, { workerToken });
        if (!acquired) {
          results.push({ status: 'LEASE_CONFLICT', messageId: candidate.id });
          continue;
        }
      }

      try {
        const result = await reconcileSingleMessage(candidate, { workerToken, dryRun });
        results.push(result);
      } catch (error) {
        results.push({
          status: 'ERROR',
          messageId: candidate.id,
          error: error.message,
        });
      }
    }

    return results;
  };

  const cleanupExpiredStaging = async ({
    dryRun = false,
    limit = 100,
    workerToken = defaultWorkerToken,
  } = {}) => {
    const currentTime = now();
    const results = [];

    // CRÍTICO: Nunca expirar upload CLAIMED vinculado a mensagem
    const expiredUploads = await prisma.chatAttachmentUpload.findMany({
      where: {
        status: { in: ['STAGED', 'READY'] },
        messageId: null,
        expiresAt: { lte: currentTime },
      },
      take: limit,
      orderBy: { expiresAt: 'asc' },
    });

    for (const upload of expiredUploads) {
      if (dryRun) {
        results.push({
          status: 'WOULD_EXPIRE',
          uploadId: upload.id,
          stagingKey: upload.stagingKey,
        });
        continue;
      }

      await runCriticalTransaction(prisma, async (tx) => {
        await tx.chatAttachmentUpload.update({
          where: { id: upload.id },
          data: {
            status: 'EXPIRED',
            failedAt: currentTime,
            failureCode: 'STAGING_TTL_EXPIRED',
          },
        });

        await logAudit(tx, {
          entityType: 'CHAT_ATTACHMENT_UPLOAD',
          entityId: upload.id,
          action: CHAT_RECONCILIATION_ACTIONS.STAGING_EXPIRED,
          beforeJson: { status: upload.status },
          afterJson: { status: 'EXPIRED' },
          reason: 'Upload temporário expirado por TTL de 24h sem consumo em mensagem.',
          correlationId: workerToken,
        });
      });

      if (storage) {
        try {
          await storage.removeTemporary(upload.stagingKey);
        } catch {
          // Remoção física idempotente
        }
      }

      results.push({
        status: 'EXPIRED',
        uploadId: upload.id,
        stagingKey: upload.stagingKey,
      });
    }

    return results;
  };

  const detectOrphans = async ({
    _dryRun = true,
    gracePeriodMs = stagingGracePeriodMs,
    quarantineRetentionMs: customRetentionMs = null,
    workerToken = defaultWorkerToken,
  } = {}) => {
    if (!storage || typeof storage.listKeys !== 'function') {
      return { staging: [], objects: [], quarantine: [] };
    }

    const currentTime = now();
    const effectiveQuarantineRetention = customRetentionMs ?? quarantineRetentionMs;
    const stagingKeys = await storage.listKeys('staging');
    const objectKeys = await storage.listKeys('objects');
    const quarantineKeys = await storage.listKeys('quarantine');

    const orphans = {
      staging: [],
      objects: [],
      quarantine: [],
    };

    // 1. Staging orphans
    if (stagingKeys.length > 0) {
      const registered = await prisma.chatAttachmentUpload.findMany({
        where: { stagingKey: { in: stagingKeys } },
        select: { stagingKey: true },
      });
      const registeredSet = new Set(registered.map((r) => r.stagingKey));

      for (const key of stagingKeys) {
        if (!registeredSet.has(key)) {
          let isOlderThanGrace = true;
          try {
            const head = await storage.head(key);
            const mtime = head?.modifiedAt ?? head?.mtime;
            if (mtime) {
              const age = currentTime.getTime() - new Date(mtime).getTime();
              isOlderThanGrace = age > gracePeriodMs;
            }
          } catch {
            // falha de head ignora
          }

          if (isOlderThanGrace) {
            orphans.staging.push({
              key,
              autoDeleteProhibited: true,
              status: 'SUSPECT_ORPHAN_CANDIDATE_FOR_REVIEW',
            });
            await logAudit(prisma, {
              entityType: 'CHAT_STORAGE',
              entityId: key,
              action: CHAT_RECONCILIATION_ACTIONS.ORPHAN_DETECTED,
              reason: 'Arquivo em staging sem registro em banco detectado. Preservado como candidato a revisão (exclusão automática proibida).',
              correlationId: workerToken,
            });
          }
        }
      }
    }

    // 2. Objects orphans: NUNCA EXCLUIR AUTOMATICAMENTE
    if (objectKeys.length > 0) {
      const registeredInAttachments = await prisma.chatMessageAttachment.findMany({
        where: { storagePath: { in: objectKeys } },
        select: { storagePath: true },
      });
      const registeredInUploads = await prisma.chatAttachmentUpload.findMany({
        where: { targetStorageKey: { in: objectKeys } },
        select: { targetStorageKey: true },
      });

      const registeredDefinitive = new Set([
        ...registeredInAttachments.map((a) => a.storagePath),
        ...registeredInUploads.map((u) => u.targetStorageKey),
      ]);

      for (const key of objectKeys) {
        if (!registeredDefinitive.has(key)) {
          orphans.objects.push({
            key,
            autoDeleteProhibited: true,
            status: 'ORPHAN_DEFINITIVE_OBJECT_REPORTED_ONLY',
          });
          await logAudit(prisma, {
            entityType: 'CHAT_STORAGE',
            entityId: key,
            action: CHAT_RECONCILIATION_ACTIONS.ORPHAN_DETECTED,
            reason: 'Objeto definitivo sem referência em banco detectado. Exclusão automática proibida.',
            correlationId: workerToken,
          });
        }
      }
    }

    // 3. Quarantine files
    for (const key of quarantineKeys) {
      let isPastRetention = false;
      try {
        const head = await storage.head(key);
        const mtime = head?.modifiedAt ?? head?.mtime;
        if (mtime) {
          const age = currentTime.getTime() - new Date(mtime).getTime();
          isPastRetention = age > effectiveQuarantineRetention;
        }
      } catch {
        // ignora
      }

      orphans.quarantine.push({
        key,
        retentionExpired: isPastRetention,
      });
    }

    return orphans;
  };

  const runFullReconciliation = async ({
    dryRun = false,
    limit = 50,
    workerToken = defaultWorkerToken,
    timeoutMs = 60_000,
  } = {}) => {
    const startedAt = now();
    const deadline = startedAt.getTime() + timeoutMs;

    const messages = await reconcilePendingMessages({ dryRun, limit, workerToken });

    if (now().getTime() > deadline) {
      return {
        dryRun,
        workerToken,
        timedOut: true,
        messages,
        expiredStaging: [],
        orphans: { staging: [], objects: [], quarantine: [] },
      };
    }

    const expiredStaging = await cleanupExpiredStaging({ dryRun, limit, workerToken });

    if (now().getTime() > deadline) {
      return {
        dryRun,
        workerToken,
        timedOut: true,
        messages,
        expiredStaging,
        orphans: { staging: [], objects: [], quarantine: [] },
      };
    }

    const orphans = await detectOrphans({ dryRun, workerToken });

    return {
      dryRun,
      workerToken,
      timedOut: false,
      durationMs: now().getTime() - startedAt.getTime(),
      messages,
      expiredStaging,
      orphans,
    };
  };

  return {
    acquireMessageLease,
    reconcileMessage: reconcileSingleMessage,
    reconcilePendingMessages,
    cleanupExpiredStaging,
    detectOrphans,
    runFullReconciliation,
  };
}
