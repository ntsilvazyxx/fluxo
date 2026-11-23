import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { createChatAttachmentReconciliationService } from '../../src/modules/chat/chat-attachment-reconciliation.service.js';
import { createLocalChatAttachmentStorage } from '../../src/modules/chat/chat-attachment.local-storage.js';
import { getChatHomologationDatabaseUrl } from '../../testing/chat-homologation-guard.js';

const createMockPrisma = (initialData = {}) => {
  const data = {
    chatMessages: initialData.chatMessages ? [...initialData.chatMessages] : [],
    chatAttachmentUploads: initialData.chatAttachmentUploads ? [...initialData.chatAttachmentUploads] : [],
    chatMessageAttachments: initialData.chatMessageAttachments ? [...initialData.chatMessageAttachments] : [],
    auditEvents: initialData.auditEvents ? [...initialData.auditEvents] : [],
  };

  const prisma = {
    $executeRaw: async (_strings, ...values) => {
      if (values.length >= 4) {
        const msg = data.chatMessages.find((m) => m.id === values[3]);
        if (msg && msg.status === 'PENDING' && (!msg.reconciliationClaimExpiresAt || msg.reconciliationClaimExpiresAt < values[4])) {
          msg.reconciliationClaimToken = values[0];
          msg.reconciliationClaimedAt = values[1];
          msg.reconciliationClaimExpiresAt = values[2];
          msg.reconciliationAttempts = (msg.reconciliationAttempts || 0) + 1;
          return 1;
        }
        return 0;
      }
      return 1;
    },
    $transaction: async (op) => (typeof op === 'function' ? op(prisma) : Promise.all(op)),
    chatMessage: {
      findMany: async ({ where = {}, take, _orderBy } = {}) => {
        let list = data.chatMessages.filter((m) => {
          if (where.status && m.status !== where.status) return false;
          if (where.OR) {
            const matchesOr = where.OR.some((cond) => {
              if (cond.reconciliationClaimExpiresAt === null && (!m.reconciliationClaimExpiresAt || m.reconciliationClaimExpiresAt === null)) return true;
              if (cond.reconciliationClaimExpiresAt?.lt && m.reconciliationClaimExpiresAt && m.reconciliationClaimExpiresAt < cond.reconciliationClaimExpiresAt.lt) return true;
              return false;
            });
            if (!matchesOr) return false;
          }
          return true;
        });
        if (take) list = list.slice(0, take);
        return list.map((item) => ({ ...item }));
      },
      findUnique: async ({ where = {} } = {}) => {
        const item = data.chatMessages.find((m) => m.id === where.id);
        return item ? { ...item } : null;
      },
      update: async ({ where = {}, data: patch = {} } = {}) => {
        const item = data.chatMessages.find((m) => m.id === where.id);
        if (!item) throw new Error('Message not found');
        Object.assign(item, patch);
        return { ...item };
      },
    },
    chatAttachmentUpload: {
      findMany: async ({ where = {}, take } = {}) => {
        let list = data.chatAttachmentUploads.filter((u) => {
          if (where.messageId !== undefined && u.messageId !== where.messageId) return false;
          if (where.status?.in && !where.status.in.includes(u.status)) return false;
          if (where.status && typeof where.status === 'string' && u.status !== where.status) return false;
          if (where.expiresAt?.lte && u.expiresAt > where.expiresAt.lte) return false;
          if (where.stagingKey?.in && !where.stagingKey.in.includes(u.stagingKey)) return false;
          if (where.targetStorageKey?.in && !where.targetStorageKey.in.includes(u.targetStorageKey)) return false;
          return true;
        });
        if (take) list = list.slice(0, take);
        return list.map((item) => ({ ...item }));
      },
      findUnique: async ({ where = {} } = {}) => {
        const item = data.chatAttachmentUploads.find((u) => u.id === where.id);
        return item ? { ...item } : null;
      },
      update: async ({ where = {}, data: patch = {} } = {}) => {
        const item = data.chatAttachmentUploads.find((u) => u.id === where.id);
        if (!item) throw new Error('Upload not found');
        Object.assign(item, patch);
        return { ...item };
      },
      updateMany: async ({ where = {}, data: patch = {} } = {}) => {
        let count = 0;
        for (const item of data.chatAttachmentUploads) {
          if (where.messageId && item.messageId !== where.messageId) continue;
          if (where.status && item.status !== where.status) continue;
          Object.assign(item, patch);
          count++;
        }
        return { count };
      },
    },
    chatMessageAttachment: {
      findMany: async ({ where = {} } = {}) => {
        return data.chatMessageAttachments
          .filter((a) => {
            if (where.messageId && a.messageId !== where.messageId) return false;
            if (where.storagePath?.in && !where.storagePath.in.includes(a.storagePath)) return false;
            return true;
          })
          .map((item) => ({ ...item }));
      },
      create: async ({ data: entry = {} } = {}) => {
        data.chatMessageAttachments.push({ ...entry });
        return { ...entry };
      },
    },
    auditEvent: {
      create: async ({ data: entry = {} } = {}) => {
        data.auditEvents.push({ ...entry });
        return { ...entry };
      },
    },
    _data: data,
  };

  return prisma;
};

describe('Reconciliador e consistência operacional dos anexos do Chat — Fase 5.1.5', () => {
  let rootDir;
  let storage;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), 'seaf-chat-reconciliation-test-'));
    storage = createLocalChatAttachmentStorage({ rootPath: rootDir });
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  // 1. Mensagem PENDING recuperável
  it('1. recupera mensagem PENDING e finaliza publicação para PUBLISHED', async () => {
    const content = Buffer.from('arquivo de teste');
    const staged = await storage.writeStaging(Readable.from([content]));
    const messageId = randomUUID();
    const uploadId = randomUUID();

    const prisma = createMockPrisma({
      chatMessages: [{
        id: messageId,
        status: 'PENDING',
        content: 'Mensagem com anexo',
        reconciliationAttempts: 0,
        reconciliationClaimExpiresAt: null,
      }],
      chatAttachmentUploads: [{
        id: uploadId,
        messageId,
        status: 'CLAIMED',
        stagingKey: staged.key,
        targetStorageKey: null,
        originalName: 'teste.txt',
        mimeType: 'text/plain',
        sizeBytes: staged.sizeBytes,
        sha256: staged.sha256,
        uploadedById: randomUUID(),
      }],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const results = await reconciler.reconcilePendingMessages();

    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'RECONCILED');
    assert.equal(prisma._data.chatMessages[0].status, 'PUBLISHED');
    assert.equal(prisma._data.chatAttachmentUploads[0].status, 'PROMOTED');
    assert.equal(prisma._data.chatMessageAttachments.length, 1);
    assert.equal(prisma._data.auditEvents.length, 1);
  });

  // 2. Upload CLAIMED com staging existente
  it('2. promove arquivo de staging existente para o destino definitivo', async () => {
    const content = Buffer.from('conteudo em staging');
    const staged = await storage.writeStaging(Readable.from([content]));
    const messageId = randomUUID();
    const uploadId = randomUUID();

    const prisma = createMockPrisma({
      chatMessages: [{ id: messageId, status: 'PENDING', reconciliationAttempts: 0 }],
      chatAttachmentUploads: [{
        id: uploadId,
        messageId,
        status: 'CLAIMED',
        stagingKey: staged.key,
        targetStorageKey: null,
        originalName: 'staged.txt',
        mimeType: 'text/plain',
        sizeBytes: staged.sizeBytes,
        sha256: staged.sha256,
        uploadedById: randomUUID(),
      }],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    await reconciler.reconcilePendingMessages();

    const targetKey = prisma._data.chatAttachmentUploads[0].targetStorageKey;
    assert.ok(targetKey);
    assert.equal(await storage.exists(targetKey), true);
  });

  // 3. Objeto já promovido
  it('3. reconhece objeto já promovido fisicamente sem re-promover ou duplicar', async () => {
    const content = Buffer.from('objeto promovido');
    const staged = await storage.writeStaging(Readable.from([content]));
    const targetKey = storage.createObjectKey();
    await storage.promote(staged.key, targetKey, { sizeBytes: staged.sizeBytes, sha256: staged.sha256 });

    const messageId = randomUUID();
    const uploadId = randomUUID();

    const prisma = createMockPrisma({
      chatMessages: [{ id: messageId, status: 'PENDING', reconciliationAttempts: 0 }],
      chatAttachmentUploads: [{
        id: uploadId,
        messageId,
        status: 'CLAIMED',
        stagingKey: staged.key,
        targetStorageKey: targetKey,
        originalName: 'ja_promovido.txt',
        mimeType: 'text/plain',
        sizeBytes: staged.sizeBytes,
        sha256: staged.sha256,
        uploadedById: randomUUID(),
      }],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const results = await reconciler.reconcilePendingMessages();

    assert.equal(results[0].status, 'RECONCILED');
    assert.equal(prisma._data.chatMessages[0].status, 'PUBLISHED');
    assert.equal(prisma._data.chatAttachmentUploads[0].status, 'PROMOTED');
  });

  // 4. Promoção parcial
  it('4. retoma apenas o anexo faltante em caso de promoção física parcial', async () => {
    const c1 = Buffer.from('primeiro anexo');
    const c2 = Buffer.from('segundo anexo');
    const staged1 = await storage.writeStaging(Readable.from([c1]));
    const staged2 = await storage.writeStaging(Readable.from([c2]));

    const targetKey1 = storage.createObjectKey();
    await storage.promote(staged1.key, targetKey1, { sizeBytes: staged1.sizeBytes, sha256: staged1.sha256 });

    const messageId = randomUUID();
    const up1 = randomUUID();
    const up2 = randomUUID();

    const prisma = createMockPrisma({
      chatMessages: [{ id: messageId, status: 'PENDING', reconciliationAttempts: 0 }],
      chatAttachmentUploads: [
        {
          id: up1,
          messageId,
          status: 'CLAIMED',
          stagingKey: staged1.key,
          targetStorageKey: targetKey1,
          originalName: 'a1.txt',
          mimeType: 'text/plain',
          sizeBytes: staged1.sizeBytes,
          sha256: staged1.sha256,
          uploadedById: randomUUID(),
        },
        {
          id: up2,
          messageId,
          status: 'CLAIMED',
          stagingKey: staged2.key,
          targetStorageKey: null,
          originalName: 'a2.txt',
          mimeType: 'text/plain',
          sizeBytes: staged2.sizeBytes,
          sha256: staged2.sha256,
          uploadedById: randomUUID(),
        },
      ],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const results = await reconciler.reconcilePendingMessages();

    assert.equal(results[0].status, 'RECONCILED');
    assert.equal(prisma._data.chatMessages[0].status, 'PUBLISHED');
    assert.equal(prisma._data.chatMessageAttachments.length, 2);
    assert.equal(prisma._data.chatMessageAttachments[0].position, 0);
    assert.equal(prisma._data.chatMessageAttachments[1].position, 1);
  });

  // 5. Arquivo ausente
  it('5. detecta arquivo ausente e não publica mensagem inconsistente', async () => {
    const messageId = randomUUID();
    const prisma = createMockPrisma({
      chatMessages: [{ id: messageId, status: 'PENDING', reconciliationAttempts: 0 }],
      chatAttachmentUploads: [{
        id: randomUUID(),
        messageId,
        status: 'CLAIMED',
        stagingKey: `staging/${randomUUID()}.upload`,
        targetStorageKey: `objects/ab/${randomUUID()}.object`,
        originalName: 'fantasma.txt',
        mimeType: 'text/plain',
        sizeBytes: 100,
        sha256: 'a'.repeat(64),
        uploadedById: randomUUID(),
      }],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const results = await reconciler.reconcilePendingMessages();

    assert.equal(results[0].status, 'MISSING_FILE');
    assert.equal(prisma._data.chatMessages[0].status, 'PENDING');
  });

  // 6. SHA-256 divergente
  it('6. rejeita publicação se houver divergência de SHA-256 no arquivo', async () => {
    const content = Buffer.from('conteudo real');
    const staged = await storage.writeStaging(Readable.from([content]));
    const messageId = randomUUID();

    const prisma = createMockPrisma({
      chatMessages: [{ id: messageId, status: 'PENDING', reconciliationAttempts: 0 }],
      chatAttachmentUploads: [{
        id: randomUUID(),
        messageId,
        status: 'CLAIMED',
        stagingKey: staged.key,
        targetStorageKey: null,
        originalName: 'divergente.txt',
        mimeType: 'text/plain',
        sizeBytes: staged.sizeBytes,
        sha256: 'b'.repeat(64), // SHA divergente
        uploadedById: randomUUID(),
      }],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const results = await reconciler.reconcilePendingMessages();

    assert.equal(results[0].status, 'INTEGRITY_MISMATCH');
    assert.equal(prisma._data.chatMessages[0].status, 'PENDING');
  });

  // 7. Upload expirado
  it('7. expira upload em staging com TTL vencido e remove arquivo temporário', async () => {
    const content = Buffer.from('expirar este');
    const staged = await storage.writeStaging(Readable.from([content]));
    const uploadId = randomUUID();

    const pastDate = new Date(Date.now() - 25 * 3600_000);
    const prisma = createMockPrisma({
      chatAttachmentUploads: [{
        id: uploadId,
        messageId: null,
        status: 'READY',
        stagingKey: staged.key,
        expiresAt: pastDate,
      }],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const results = await reconciler.cleanupExpiredStaging();

    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'EXPIRED');
    assert.equal(prisma._data.chatAttachmentUploads[0].status, 'EXPIRED');
    assert.equal(await storage.exists(staged.key), false);
  });

  // 8. Upload CLAIMED com TTL vencido
  it('8. NUNCA expira upload CLAIMED vinculado a mensagem pendente mesmo com TTL vencido', async () => {
    const content = Buffer.from('salvar este');
    const staged = await storage.writeStaging(Readable.from([content]));
    const uploadId = randomUUID();
    const pastDate = new Date(Date.now() - 25 * 3600_000);

    const prisma = createMockPrisma({
      chatAttachmentUploads: [{
        id: uploadId,
        messageId: randomUUID(), // Vinculado a mensagem
        status: 'CLAIMED',
        stagingKey: staged.key,
        expiresAt: pastDate,
      }],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const results = await reconciler.cleanupExpiredStaging();

    assert.equal(results.length, 0); // Não deve ser expirado
    assert.equal(prisma._data.chatAttachmentUploads[0].status, 'CLAIMED');
    assert.equal(await storage.exists(staged.key), true);
  });

  // 9. Arquivo órfão em staging
  it('9. detecta arquivo órfão em staging mas preserva para revisão sem exclusão automática indevida', async () => {
    const staged = await storage.writeStaging(Readable.from(['orfao staging']));
    const prisma = createMockPrisma({ chatAttachmentUploads: [] });

    const reconciler = createChatAttachmentReconciliationService({
      prisma,
      storage,
      stagingGracePeriodMs: 0, // sem carência no teste
    });

    const orphans = await reconciler.detectOrphans({ dryRun: false, gracePeriodMs: 0 });
    assert.equal(orphans.staging.length, 1);
    assert.equal(orphans.staging[0].key, staged.key);
    assert.equal(orphans.staging[0].autoDeleteProhibited, true);
    assert.equal(await storage.exists(staged.key), true); // PRESERVADO!
  });

  // 10. Arquivo órfão definitivo
  it('10. detecta arquivo órfão definitivo mas NUNCA o exclui automaticamente', async () => {
    const staged = await storage.writeStaging(Readable.from(['orfao definitivo']));
    const objectKey = storage.createObjectKey();
    await storage.promote(staged.key, objectKey, { sizeBytes: staged.sizeBytes, sha256: staged.sha256 });

    const prisma = createMockPrisma({
      chatMessageAttachments: [],
      chatAttachmentUploads: [],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const orphans = await reconciler.detectOrphans({ dryRun: false });

    assert.equal(orphans.objects.length, 1);
    assert.equal(orphans.objects[0].key, objectKey);
    assert.equal(orphans.objects[0].autoDeleteProhibited, true);
    assert.equal(await storage.exists(objectKey), true); // PRESERVADO!
  });

  // 11. Quarentena dentro da retenção
  it('11. retém arquivo em quarentena quando dentro do período de 30 dias', async () => {
    const staged = await storage.writeStaging(Readable.from(['quarentena']));
    const qKey = `quarantine/${randomUUID().slice(0, 2)}/${randomUUID()}.quarantine`;
    await storage.quarantine(staged.key, { quarantineKey: qKey, sizeBytes: staged.sizeBytes, sha256: staged.sha256 });

    const prisma = createMockPrisma();
    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const orphans = await reconciler.detectOrphans({ dryRun: true });

    assert.equal(orphans.quarantine.length, 1);
    assert.equal(orphans.quarantine[0].retentionExpired, false);
  });

  // 12. Quarentena após retenção
  it('12. sinaliza expiração de retenção de quarentena quando após 30 dias', async () => {
    const staged = await storage.writeStaging(Readable.from(['quarentena antiga']));
    const qKey = `quarantine/${randomUUID().slice(0, 2)}/${randomUUID()}.quarantine`;
    await storage.quarantine(staged.key, { quarantineKey: qKey, sizeBytes: staged.sizeBytes, sha256: staged.sha256 });

    const prisma = createMockPrisma();
    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const orphans = await reconciler.detectOrphans({ dryRun: true, quarantineRetentionMs: -1 });

    assert.equal(orphans.quarantine.length, 1);
    assert.equal(orphans.quarantine[0].retentionExpired, true);
  });

  // 13. Execução concorrente
  it('13. impede concorrência e gera LEASE_CONFLICT quando worker 2 tenta disputar mensagem já alocada', async () => {
    const messageId = randomUUID();

    const prisma = createMockPrisma({
      chatMessages: [{
        id: messageId,
        status: 'PENDING',
        reconciliationClaimToken: null,
        reconciliationClaimExpiresAt: null,
        reconciliationAttempts: 1,
      }],
    });
    prisma.$executeRaw = async () => 0; // simula conflito de disputa atômica no MariaDB

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const results = await reconciler.reconcilePendingMessages({ workerToken: 'worker-2' });

    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'LEASE_CONFLICT');
  });

  // 14. Lease expirado
  it('14. permite novo worker assumir lease expirado de processamento abandonado', async () => {
    const messageId = randomUUID();
    const pastDate = new Date(Date.now() - 10_000);

    const prisma = createMockPrisma({
      chatMessages: [{
        id: messageId,
        status: 'PENDING',
        reconciliationClaimToken: 'worker-abandonado',
        reconciliationClaimExpiresAt: pastDate,
        reconciliationAttempts: 1,
      }],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const results = await reconciler.reconcilePendingMessages({ workerToken: 'worker-novo' });

    assert.equal(results[0].status, 'RECONCILED');
    assert.equal(prisma._data.chatMessages[0].status, 'PUBLISHED');
  });

  // 15. Worker interrompido
  it('15. permite que novo ciclo retome mensagem interrompida pelo término inesperado do worker', async () => {
    const content = Buffer.from('conteudo worker interrompido');
    const staged = await storage.writeStaging(Readable.from([content]));
    const targetKey = storage.createObjectKey();
    await storage.promote(staged.key, targetKey, { sizeBytes: staged.sizeBytes, sha256: staged.sha256 });

    const messageId = randomUUID();
    const prisma = createMockPrisma({
      chatMessages: [{
        id: messageId,
        status: 'PENDING',
        reconciliationAttempts: 1,
        reconciliationClaimExpiresAt: null,
      }],
      chatAttachmentUploads: [{
        id: randomUUID(),
        messageId,
        status: 'CLAIMED',
        stagingKey: staged.key,
        targetStorageKey: targetKey,
        originalName: 'interrompido.txt',
        mimeType: 'text/plain',
        sizeBytes: staged.sizeBytes,
        sha256: staged.sha256,
        uploadedById: randomUUID(),
      }],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const results = await reconciler.reconcilePendingMessages();

    assert.equal(results[0].status, 'RECONCILED');
    assert.equal(prisma._data.chatMessages[0].status, 'PUBLISHED');
  });

  // 16. Reexecução idempotente
  it('16. não duplica anexos e permanece idempotente em reexecuções sucessivas', async () => {
    const content = Buffer.from('conteudo idempotente');
    const staged = await storage.writeStaging(Readable.from([content]));
    const messageId = randomUUID();

    const prisma = createMockPrisma({
      chatMessages: [{ id: messageId, status: 'PENDING', reconciliationAttempts: 0 }],
      chatAttachmentUploads: [{
        id: randomUUID(),
        messageId,
        status: 'CLAIMED',
        stagingKey: staged.key,
        targetStorageKey: null,
        originalName: 'idempotente.txt',
        mimeType: 'text/plain',
        sizeBytes: staged.sizeBytes,
        sha256: staged.sha256,
        uploadedById: randomUUID(),
      }],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    await reconciler.reconcilePendingMessages();
    assert.equal(prisma._data.chatMessageAttachments.length, 1);

    // Segunda execução
    await reconciler.reconcilePendingMessages();
    assert.equal(prisma._data.chatMessageAttachments.length, 1);
  });

  // 17. Transação de publicação falhando
  it('17. reporta erro com segurança se transação de publicação falhar', async () => {
    const messageId = randomUUID();
    const prisma = createMockPrisma({
      chatMessages: [{ id: messageId, status: 'PENDING', reconciliationAttempts: 0 }],
      chatAttachmentUploads: [],
    });
    prisma.chatMessage.update = async () => {
      throw new Error('Falha simulada na transação de banco');
    };

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const results = await reconciler.reconcilePendingMessages();

    assert.equal(results[0].status, 'ERROR');
    assert.match(results[0].error, /Falha simulada na transação de banco/);
  });

  // 18. Auditoria falhando
  it('18. falha na gravação de auditoria não quebra publicação da mensagem', async () => {
    const messageId = randomUUID();
    const prisma = createMockPrisma({
      chatMessages: [{ id: messageId, status: 'PENDING', reconciliationAttempts: 0 }],
      chatAttachmentUploads: [],
    });
    prisma.auditEvent.create = async () => {
      throw new Error('Erro no subsistema de auditoria');
    };

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const results = await reconciler.reconcilePendingMessages();

    assert.equal(results[0].status, 'RECONCILED');
    assert.equal(prisma._data.chatMessages[0].status, 'PUBLISHED');
  });

  // 19. Dry-run sem mutações
  it('19. modo dry-run reporta ações potenciais com zero alterações no banco e storage', async () => {
    const staged = await storage.writeStaging(Readable.from(['dry-run content']));
    const messageId = randomUUID();

    const prisma = createMockPrisma({
      chatMessages: [{ id: messageId, status: 'PENDING', reconciliationAttempts: 0 }],
      chatAttachmentUploads: [{
        id: randomUUID(),
        messageId,
        status: 'CLAIMED',
        stagingKey: staged.key,
        targetStorageKey: null,
        originalName: 'dryrun.txt',
        mimeType: 'text/plain',
        sizeBytes: staged.sizeBytes,
        sha256: staged.sha256,
        uploadedById: randomUUID(),
      }],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const results = await reconciler.reconcilePendingMessages({ dryRun: true });

    assert.equal(results[0].status, 'WOULD_RECONCILE');
    assert.equal(prisma._data.chatMessages[0].status, 'PENDING');
    assert.equal(prisma._data.chatMessageAttachments.length, 0);
    assert.equal(prisma._data.auditEvents.length, 0);
  });

  // 20. Limite de lote
  it('20. respeita o limite de lote informado', async () => {
    const prisma = createMockPrisma({
      chatMessages: [
        { id: randomUUID(), status: 'PENDING', reconciliationAttempts: 0 },
        { id: randomUUID(), status: 'PENDING', reconciliationAttempts: 0 },
        { id: randomUUID(), status: 'PENDING', reconciliationAttempts: 0 },
      ],
      chatAttachmentUploads: [],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const results = await reconciler.reconcilePendingMessages({ limit: 2 });

    assert.equal(results.length, 2);
  });

  // 21. Timeout
  it('21. encerra graciosamente quando atinge o timeout da execução', async () => {
    const prisma = createMockPrisma();
    let tick = 0;
    const timeFn = () => new Date(1_000_000 + (tick++ * 100_000));

    const reconciler = createChatAttachmentReconciliationService({
      prisma,
      storage,
      now: timeFn,
    });

    const report = await reconciler.runFullReconciliation({ timeoutMs: 50_000 });
    assert.equal(report.timedOut, true);
  });

  // 22. Cancelamento controlado e preservação de mensagem após limite de tentativas
  it('22. limite máximo de tentativas excedido preserva mensagem como PENDING para intervenção manual (não destrói)', async () => {
    const messageId = randomUUID();
    const prisma = createMockPrisma({
      chatMessages: [{
        id: messageId,
        status: 'PENDING',
        reconciliationAttempts: 5, // Limite padrão atingido
        reconciliationClaimToken: 'worker-token',
      }],
      chatAttachmentUploads: [{
        id: randomUUID(),
        messageId,
        status: 'CLAIMED',
      }],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage, maxAttempts: 5 });
    const results = await reconciler.reconcilePendingMessages();

    assert.equal(results[0].status, 'MAX_ATTEMPTS_EXCEEDED_PRESERVED');
    assert.equal(prisma._data.chatMessages[0].status, 'PENDING');
    assert.equal(prisma._data.chatMessages[0].reconciliationClaimToken, null);
  });

  // 23. Proteção do banco operacional
  it('23. rejeita com segurança execução configurada para o banco operacional protegido', () => {
    assert.throws(
      () => getChatHomologationDatabaseUrl({
        RUN_CHAT_REAL_HOMOLOGATION: '1',
        CHAT_HOMOLOGATION_DATABASE_URL: 'mysql://user:pass@127.0.0.1:3306/seaf_gestao_functional',
      }),
      /banco operacional seaf_gestao_functional é protegido/,
    );
  });

  // 24. Mensagem já publicada
  it('24. ignora mensagens já em status PUBLISHED', async () => {
    const prisma = createMockPrisma({
      chatMessages: [{ id: randomUUID(), status: 'PUBLISHED', reconciliationAttempts: 0 }],
      chatAttachmentUploads: [],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const results = await reconciler.reconcilePendingMessages();

    assert.equal(results.length, 0);
  });

  // 25. Upload já expirado
  it('25. ignora uploads que já se encontram no status EXPIRED', async () => {
    const prisma = createMockPrisma({
      chatAttachmentUploads: [{
        id: randomUUID(),
        status: 'EXPIRED',
        expiresAt: new Date(Date.now() - 3600_000),
        messageId: null,
      }],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    const results = await reconciler.cleanupExpiredStaging();

    assert.equal(results.length, 0);
  });

  // 26. Perda de lease durante promoção física (fence)
  it('26. aborta publicação se lease for perdido durante a promoção física (fence de concorrência)', async () => {
    const content = Buffer.from('conteudo fence');
    const staged = await storage.writeStaging(Readable.from([content]));
    const messageId = randomUUID();

    const prisma = createMockPrisma({
      chatMessages: [{
        id: messageId,
        status: 'PENDING',
        reconciliationClaimToken: 'outro-worker', // Lease pertence a outro
        reconciliationAttempts: 1,
      }],
      chatAttachmentUploads: [{
        id: randomUUID(),
        messageId,
        status: 'CLAIMED',
        stagingKey: staged.key,
        targetStorageKey: null,
        originalName: 'fence.txt',
        mimeType: 'text/plain',
        sizeBytes: staged.sizeBytes,
        sha256: staged.sha256,
        uploadedById: randomUUID(),
      }],
    });

    const reconciler = createChatAttachmentReconciliationService({ prisma, storage });
    // Tenta reconciliar com worker-antigo que perdeu o lease
    const result = await reconciler.reconcileMessage(
      prisma._data.chatMessages[0],
      { workerToken: 'worker-antigo-que-perdeu-o-lease', dryRun: false },
    );

    assert.equal(result.status, 'LEASE_CONFLICT');
  });
});
