import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createChatAttachmentService } from '../../src/modules/chat/chat-attachment.service.js';

describe('Serviço de Staging de Anexos do Chat (chat-attachment.service.js)', () => {
  let tmpDir;
  let mockFile;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'seaf-service-test-'));
    const filePath = path.join(tmpDir, 'test.txt');
    await writeFile(filePath, 'conteudo de teste para staging');
    mockFile = { path: filePath, originalname: 'test.txt' };
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const makeMockStorage = () => ({
    createStagingKey: () => `staging/${randomUUID()}.upload`,
    createObjectKey: () => `objects/00/${randomUUID()}.object`,
    createQuarantineKey: () => `quarantine/00/${randomUUID()}.quarantine`,
    writeStaging: async (_stream, opts) => ({ key: opts.key, sizeBytes: 100, sha256: 'a'.repeat(64) }),
    head: async () => ({ sizeBytes: 100, sha256: 'a'.repeat(64) }),
    openReadStream: async () => {},
    exists: async () => true,
    promote: async () => ({ key: 'objects/00/test.object', sizeBytes: 100, sha256: 'a'.repeat(64) }),
    quarantine: async () => ({ key: 'quarantine/00/test.quarantine', sizeBytes: 100, sha256: 'a'.repeat(64) }),
    removeTemporary: async () => true,
  });

  const makeMockScanner = (available = true, clean = true) => ({
    isAvailable: async () => available,
    scanFile: async () => ({ result: clean ? 'CLEAN' : 'INFECTED' }),
  });

  const makeMockPrisma = (overrides = {}) => {
    const taskId = overrides.taskId ?? randomUUID();
    const conversationId = overrides.conversationId ?? randomUUID();
    const userId = overrides.userId ?? randomUUID();

    const task = overrides.task !== undefined ? overrides.task : {
      id: taskId,
      deletedAt: null,
      teamId: randomUUID(),
      team: { managers: [] },
    };

    const conversation = overrides.conversation !== undefined ? overrides.conversation : {
      id: conversationId,
      taskId,
      lockState: overrides.lockState ?? { isLocked: false },
    };

    const participant = overrides.participant !== undefined ? overrides.participant : {
      id: randomUUID(),
      conversationId,
      userId,
      periods: [{ id: randomUUID(), endedAt: null }],
    };

    return {
      task: {
        findUnique: async () => task,
      },
      chatConversation: {
        findUnique: async () => conversation,
      },
      chatParticipant: {
        findUnique: async () => participant,
      },
      chatAttachmentUpload: {
        findUnique: async () => overrides.existingUpload ?? null,
        aggregate: async () => ({ _sum: { sizeBytes: overrides.aggregateBytes ?? 0n } }),
        create: async ({ data }) => ({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        update: async ({ data }) => ({
          ...overrides.existingUpload,
          ...data,
          updatedAt: new Date(),
        }),
      },
      auditEvent: {
        create: async () => ({ id: randomUUID() }),
      },
      $transaction: async (fn) => fn({
        task: { findUnique: async () => task },
        chatConversation: { findUnique: async () => conversation },
        chatParticipant: { findUnique: async () => participant },
        chatAttachmentUpload: {
          findUnique: async () => overrides.existingUpload ?? null,
          aggregate: async () => ({ _sum: { sizeBytes: overrides.aggregateBytes ?? 0n } }),
          create: async ({ data }) => ({
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
          update: async ({ data }) => ({
            ...overrides.existingUpload,
            ...data,
            updatedAt: new Date(),
          }),
        },
        auditEvent: { create: async () => ({ id: randomUUID() }) },
        $queryRawUnsafe: async () => [],
      }),
    };
  };

  const actor = { userId: randomUUID(), roleCode: 'TECHNICIAN' };
  const mockInspect = async () => ({
    originalName: 'test.txt',
    extension: '.txt',
    mimeType: 'text/plain',
    sizeBytes: 100,
    sha256: 'a'.repeat(64),
  });

  it('exige quotas finitas e positivas na inicialização', () => {
    assert.throws(() => createChatAttachmentService({
      prisma: {},
      storage: makeMockStorage(),
      scanner: makeMockScanner(),
      userQuotaBytes: 0,
      conversationQuotaBytes: 1000,
    }), TypeError);
  });

  it('recusa upload quando o recurso de storage está desabilitado (503)', async () => {
    const service = createChatAttachmentService({
      prisma: makeMockPrisma(),
      storage: makeMockStorage(),
      scanner: makeMockScanner(),
      enabled: false,
      userQuotaBytes: 1024 * 1024,
      conversationQuotaBytes: 5 * 1024 * 1024,
      inspect: mockInspect,
    });

    await assert.rejects(
      () => service.stage(actor, randomUUID(), randomUUID(), mockFile),
      (err) => err.status === 503 && err.code === 'CHAT_ATTACHMENTS_DISABLED',
    );
  });

  it('retorna 404 quando a tarefa não existe', async () => {
    const service = createChatAttachmentService({
      prisma: makeMockPrisma({ task: null }),
      storage: makeMockStorage(),
      scanner: makeMockScanner(),
      enabled: true,
      userQuotaBytes: 1024 * 1024,
      conversationQuotaBytes: 5 * 1024 * 1024,
      inspect: mockInspect,
    });

    await assert.rejects(
      () => service.stage(actor, randomUUID(), randomUUID(), mockFile),
      (err) => err.status === 404 && err.code === 'TASK_NOT_FOUND',
    );
  });

  it('retorna 404 quando o chat da tarefa não foi inicializado', async () => {
    const service = createChatAttachmentService({
      prisma: makeMockPrisma({ conversation: null }),
      storage: makeMockStorage(),
      scanner: makeMockScanner(),
      enabled: true,
      userQuotaBytes: 1024 * 1024,
      conversationQuotaBytes: 5 * 1024 * 1024,
      inspect: mockInspect,
    });

    await assert.rejects(
      () => service.stage(actor, randomUUID(), randomUUID(), mockFile),
      (err) => err.status === 404 && err.code === 'CHAT_NOT_INITIALIZED',
    );
  });

  it('retorna 403 quando o usuário não é participante ativo', async () => {
    const service = createChatAttachmentService({
      prisma: makeMockPrisma({ participant: null }),
      storage: makeMockStorage(),
      scanner: makeMockScanner(),
      enabled: true,
      userQuotaBytes: 1024 * 1024,
      conversationQuotaBytes: 5 * 1024 * 1024,
      inspect: mockInspect,
    });

    await assert.rejects(
      () => service.stage(actor, randomUUID(), randomUUID(), mockFile),
      (err) => err.status === 403 && err.code === 'FORBIDDEN',
    );
  });

  it('retorna 423 quando o chat está temporariamente bloqueado', async () => {
    const service = createChatAttachmentService({
      prisma: makeMockPrisma({ lockState: { isLocked: true } }),
      storage: makeMockStorage(),
      scanner: makeMockScanner(),
      enabled: true,
      userQuotaBytes: 1024 * 1024,
      conversationQuotaBytes: 5 * 1024 * 1024,
      inspect: mockInspect,
    });

    await assert.rejects(
      () => service.stage(actor, randomUUID(), randomUUID(), mockFile),
      (err) => err.status === 423 && err.code === 'CHAT_LOCKED',
    );
  });

  it('retorna 503 quando o scanner antivírus está indisponível', async () => {
    const service = createChatAttachmentService({
      prisma: makeMockPrisma({ userId: actor.userId }),
      storage: makeMockStorage(),
      scanner: makeMockScanner(false), // unavailable
      enabled: true,
      userQuotaBytes: 1024 * 1024,
      conversationQuotaBytes: 5 * 1024 * 1024,
      inspect: mockInspect,
    });

    await assert.rejects(
      () => service.stage(actor, randomUUID(), randomUUID(), mockFile),
      (err) => err.status === 503 && err.code === 'CHAT_ATTACHMENT_SCANNER_UNAVAILABLE',
    );
  });

  it('retorna 422 quando o scanner rejeita o arquivo como infectado', async () => {
    const service = createChatAttachmentService({
      prisma: makeMockPrisma({ userId: actor.userId }),
      storage: makeMockStorage(),
      scanner: makeMockScanner(true, false), // infected
      enabled: true,
      userQuotaBytes: 1024 * 1024,
      conversationQuotaBytes: 5 * 1024 * 1024,
      inspect: mockInspect,
    });

    await assert.rejects(
      () => service.stage(actor, randomUUID(), randomUUID(), mockFile),
      (err) => err.status === 422 && err.code === 'CHAT_ATTACHMENT_REJECTED',
    );
  });

  it('retorna 429 quando a quota do usuário é excedida', async () => {
    const service = createChatAttachmentService({
      prisma: makeMockPrisma({ userId: actor.userId, aggregateBytes: 1000n }),
      storage: makeMockStorage(),
      scanner: makeMockScanner(true, true),
      enabled: true,
      userQuotaBytes: 500, // quota menor que o uso
      conversationQuotaBytes: 5000,
      inspect: mockInspect,
    });

    await assert.rejects(
      () => service.stage(actor, randomUUID(), randomUUID(), mockFile),
      (err) => err.status === 429 && err.code === 'CHAT_ATTACHMENT_QUOTA_EXCEEDED',
    );
  });

  it('realiza o staging com sucesso retornando status READY e metadados opacos', async () => {
    const service = createChatAttachmentService({
      prisma: makeMockPrisma({ userId: actor.userId }),
      storage: makeMockStorage(),
      scanner: makeMockScanner(true, true),
      enabled: true,
      userQuotaBytes: 1024 * 1024,
      conversationQuotaBytes: 5 * 1024 * 1024,
      inspect: mockInspect,
    });

    const result = await service.stage(actor, randomUUID(), randomUUID(), mockFile);
    assert.ok(result.id);
    assert.equal(result.originalName, 'test.txt');
    assert.equal(result.status, 'READY');
    assert.equal(result.sizeBytes, 100);
    assert.equal(result.mimeType, 'text/plain');
    assert.ok(result.expiresAt);
    // Não expõe caminho físico ou sha256
    assert.equal(result.stagingKey, undefined);
    assert.equal(result.sha256, undefined);
  });

  it('trata replay com o mesmo clientUploadId e mesmo conteúdo de forma idempotente', async () => {
    const existing = {
      id: randomUUID(),
      originalName: 'test.txt',
      mimeType: 'text/plain',
      sizeBytes: 100n,
      sha256: 'a'.repeat(64),
      status: 'READY',
      expiresAt: new Date(Date.now() + 60000),
    };

    const service = createChatAttachmentService({
      prisma: makeMockPrisma({ userId: actor.userId, existingUpload: existing }),
      storage: makeMockStorage(),
      scanner: makeMockScanner(true, true),
      enabled: true,
      userQuotaBytes: 1024 * 1024,
      conversationQuotaBytes: 5 * 1024 * 1024,
      inspect: mockInspect,
    });

    const result = await service.stage(actor, randomUUID(), randomUUID(), mockFile);
    assert.equal(result.id, existing.id);
    assert.equal(result.status, 'READY');
  });

  it('rejeita replay com o mesmo clientUploadId e conteúdo diferente (409)', async () => {
    const existing = {
      id: randomUUID(),
      originalName: 'outro.txt',
      mimeType: 'text/plain',
      sizeBytes: 200n,
      sha256: 'b'.repeat(64), // hash diferente
      status: 'READY',
      expiresAt: new Date(Date.now() + 60000),
    };

    const service = createChatAttachmentService({
      prisma: makeMockPrisma({ userId: actor.userId, existingUpload: existing }),
      storage: makeMockStorage(),
      scanner: makeMockScanner(true, true),
      enabled: true,
      userQuotaBytes: 1024 * 1024,
      conversationQuotaBytes: 5 * 1024 * 1024,
      inspect: mockInspect,
    });

    await assert.rejects(
      () => service.stage(actor, randomUUID(), randomUUID(), mockFile),
      (err) => err.status === 409 && err.code === 'UPLOAD_IDEMPOTENCY_CONFLICT',
    );
  });

  describe('Consulta (get) e Cancelamento (cancel)', () => {
    it('get retorna 404 quando o upload pertence a outro usuário', async () => {
      const upload = {
        id: randomUUID(),
        conversationId: randomUUID(),
        uploadedById: randomUUID(), // outro usuário
        originalName: 'teste.txt',
        status: 'READY',
      };

      const service = createChatAttachmentService({
        prisma: makeMockPrisma({ existingUpload: upload }),
        storage: makeMockStorage(),
        scanner: makeMockScanner(),
        enabled: true,
        userQuotaBytes: 1024 * 1024,
        conversationQuotaBytes: 5 * 1024 * 1024,
      });

      await assert.rejects(
        () => service.get(actor, randomUUID(), upload.id),
        (err) => err.status === 404 && err.code === 'CHAT_ATTACHMENT_UPLOAD_NOT_FOUND',
      );
    });

    it('cancel remove o staging e marca o upload como EXPIRED com failureCode CANCELLED_BY_USER', async () => {
      const uploadId = randomUUID();
      const conversationId = randomUUID();
      let removedKey = null;

      const storage = {
        ...makeMockStorage(),
        removeTemporary: async (k) => { removedKey = k; },
      };

      const upload = {
        id: uploadId,
        conversationId,
        uploadedById: actor.userId,
        originalName: 'teste.txt',
        stagingKey: 'staging/temp.upload',
        mimeType: 'text/plain',
        sizeBytes: 100n,
        status: 'READY',
        expiresAt: new Date(Date.now() + 60000),
      };

      const service = createChatAttachmentService({
        prisma: makeMockPrisma({
          userId: actor.userId,
          conversationId,
          existingUpload: upload,
        }),
        storage,
        scanner: makeMockScanner(),
        enabled: true,
        userQuotaBytes: 1024 * 1024,
        conversationQuotaBytes: 5 * 1024 * 1024,
      });

      const cancelled = await service.cancel(actor, randomUUID(), uploadId);
      assert.equal(cancelled.status, 'EXPIRED');
      assert.equal(removedKey, 'staging/temp.upload');
    });

    it('cancel rejeita cancelamento de upload que já foi reivindicado (CLAIMED) (409)', async () => {
      const uploadId = randomUUID();
      const conversationId = randomUUID();

      const upload = {
        id: uploadId,
        conversationId,
        uploadedById: actor.userId,
        status: 'CLAIMED',
      };

      const service = createChatAttachmentService({
        prisma: makeMockPrisma({
          userId: actor.userId,
          conversationId,
          existingUpload: upload,
        }),
        storage: makeMockStorage(),
        scanner: makeMockScanner(),
        enabled: true,
        userQuotaBytes: 1024 * 1024,
        conversationQuotaBytes: 5 * 1024 * 1024,
      });

      await assert.rejects(
        () => service.cancel(actor, randomUUID(), uploadId),
        (err) => err.status === 409 && err.code === 'CHAT_ATTACHMENT_ALREADY_CLAIMED',
      );
    });
  });
});
