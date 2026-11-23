import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { createChatMessageService } from '../../src/modules/chat/chat-message.service.js';
import { AppError } from '../../src/shared/errors/app-error.js';
import { sendMessageSchema } from '../../src/modules/chat/chat.schemas.js';

describe('FASE 5.1.3 — Consumo, Validação e Publicação de Anexos em Mensagens do Chat', () => {
  const taskId = '11111111-1111-4111-8111-111111111111';
  const conversationId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const otherConversationId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  const userId = 'usr-tech-1';
  const otherUserId = 'usr-tech-2';
  const actor = { userId, roleCode: 'TECHNICIAN' };

  const makeMockStorage = () => {
    const promoted = new Map();
    const existingKeys = new Set();

    return {
      promoted,
      existingKeys,
      createObjectKey() {
        const id = randomUUID();
        return `objects/${id.slice(0, 2)}/${id}.object`;
      },
      async promote(stagingKey, objectKey, integrity) {
        promoted.set(stagingKey, { objectKey, integrity });
        existingKeys.add(objectKey);
        return { key: objectKey, ...integrity, replayed: false };
      },
      async exists(key) {
        return existingKeys.has(key);
      },
      async head(key) {
        if (!existingKeys.has(key)) throw new AppError(404, 'NOT_FOUND');
        return { key, sizeBytes: 100 };
      },
    };
  };

  const makeMockPrisma = (initialUploads = []) => {
    const uploads = [...initialUploads];
    const messages = [];
    const messageAttachments = [];

    const task = {
      id: taskId,
      teamId: 'team-1',
      createdById: 'usr-mgr',
      currentCycleId: 'cycle-1',
      deletedAt: null,
      team: {
        id: 'team-1',
        managers: [{ userId: 'usr-mgr', endedAt: null }],
      },
    };

    const conversation = {
      id: conversationId,
      taskId,
      lockState: { isLocked: false, reason: null },
    };

    const participant = {
      id: 'part-1',
      conversationId,
      userId,
      periods: [{ id: 'period-1', endedAt: null }],
    };

    const client = {
      task: {
        async findUnique({ where }) {
          if (where.id === taskId) return task;
          return null;
        },
      },
      chatConversation: {
        async findUnique({ where }) {
          if (where.taskId === taskId) return conversation;
          return null;
        },
      },
      chatLockState: {
        async findUnique() {
          return conversation.lockState;
        },
      },
      chatParticipant: {
        async findUnique({ where }) {
          if (where.conversationId_userId?.userId === userId) return participant;
          return null;
        },
      },
      chatAttachmentUpload: {
        async findMany({ where }) {
          const ids = where.id?.in ?? [];
          return uploads.filter((u) => ids.includes(u.id));
        },
        async findUnique({ where }) {
          return uploads.find((u) => u.id === where.id) ?? null;
        },
        async update({ where, data }) {
          const idx = uploads.findIndex((u) => u.id === where.id);
          if (idx !== -1) {
            uploads[idx] = { ...uploads[idx], ...data };
            return uploads[idx];
          }
          return null;
        },
      },
      chatMessage: {
        async findFirst() {
          if (!messages.length) return null;
          return messages[messages.length - 1];
        },
        async findUnique({ where }) {
          if (where.conversationId_clientMessageId) {
            return messages.find((m) =>
              m.conversationId === where.conversationId_clientMessageId.conversationId
              && m.clientMessageId === where.conversationId_clientMessageId.clientMessageId
            ) ?? null;
          }
          return messages.find((m) => m.id === where.id) ?? null;
        },
        async create({ data }) {
          const created = {
            ...data,
            author: { id: data.authorId, name: 'Tecnico', role: { code: 'TECHNICIAN' } },
            attachments: [],
            attachmentUploads: [],
            conversation: { taskId },
          };
          messages.push(created);
          return created;
        },
        async update({ where, data }) {
          const idx = messages.findIndex((m) => m.id === where.id);
          if (idx !== -1) {
            messages[idx] = {
              ...messages[idx],
              ...data,
              attachments: messageAttachments.filter((a) => a.messageId === where.id),
            };
            return messages[idx];
          }
          return null;
        },
      },
      chatMessageAttachment: {
        async findMany({ where }) {
          return messageAttachments.filter((a) => a.messageId === where.messageId);
        },
        async create({ data }) {
          messageAttachments.push(data);
          return data;
        },
      },
      async $queryRaw() {
        return [];
      },
      async $transaction(fn) {
        return fn(client);
      },
    };

    return { client, uploads, messages, messageAttachments, conversation };
  };

  const createSampleUpload = (overrides = {}) => ({
    id: randomUUID(),
    conversationId,
    uploadedById: userId,
    clientUploadId: randomUUID(),
    messageId: null,
    originalName: 'documento.pdf',
    stagingKey: `staging/${randomUUID()}.upload`,
    targetStorageKey: null,
    mimeType: 'application/pdf',
    extension: '.pdf',
    sizeBytes: 1024n,
    sha256: 'a'.repeat(64),
    status: 'READY',
    expiresAt: new Date(Date.now() + 86400000),
    claimedAt: null,
    promotedAt: null,
    ...overrides,
  });

  describe('1. Validações de Schema e Limites de Anexos', () => {
    it('valida mensagem somente com texto', () => {
      const parsed = sendMessageSchema.safeParse({
        clientMessageId: randomUUID(),
        content: 'Olá, apenas texto.',
      });
      assert.equal(parsed.success, true);
      assert.deepEqual(parsed.data.stagedAttachmentIds, []);
    });

    it('valida mensagem com texto e anexos', () => {
      const parsed = sendMessageSchema.safeParse({
        clientMessageId: randomUUID(),
        content: 'Segue o anexo.',
        stagedAttachmentIds: [randomUUID()],
      });
      assert.equal(parsed.success, true);
      assert.equal(parsed.data.stagedAttachmentIds.length, 1);
    });

    it('valida mensagem somente com anexos (sem texto)', () => {
      const parsed = sendMessageSchema.safeParse({
        clientMessageId: randomUUID(),
        content: '',
        stagedAttachmentIds: [randomUUID()],
      });
      assert.equal(parsed.success, true);
    });

    it('rejeita mensagem sem texto e sem anexos (mensagem vazia)', () => {
      const parsed = sendMessageSchema.safeParse({
        clientMessageId: randomUUID(),
        content: '',
        stagedAttachmentIds: [],
      });
      assert.equal(parsed.success, false);
    });

    it('rejeita IDs repetidos no stagedAttachmentIds', () => {
      const duplicateId = randomUUID();
      const parsed = sendMessageSchema.safeParse({
        clientMessageId: randomUUID(),
        content: 'Teste duplicação',
        stagedAttachmentIds: [duplicateId, duplicateId],
      });
      assert.equal(parsed.success, false);
    });

    it('rejeita mais de 5 anexos na validação de schema', () => {
      const parsed = sendMessageSchema.safeParse({
        clientMessageId: randomUUID(),
        content: 'Muitos anexos',
        stagedAttachmentIds: [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()],
      });
      assert.equal(parsed.success, false);
    });
  });

  describe('2. Validação de Propriedade e Elegibilidade dos Uploads', () => {
    it('rejeita quando anexo de staging não é encontrado no banco (404)', async () => {
      const { client } = makeMockPrisma([]);
      const service = createChatMessageService({ prisma: client });

      await assert.rejects(
        () => service.sendMessage(actor, taskId, {
          clientMessageId: randomUUID(),
          content: 'Teste inexistente',
          stagedAttachmentIds: [randomUUID()],
        }),
        (err) => err.status === 404 && err.code === 'CHAT_ATTACHMENT_UPLOAD_NOT_FOUND',
      );
    });

    it('rejeita anexo pertencente a outra conversa (403)', async () => {
      const foreignUpload = createSampleUpload({ conversationId: otherConversationId });
      const { client } = makeMockPrisma([foreignUpload]);
      const service = createChatMessageService({ prisma: client });

      await assert.rejects(
        () => service.sendMessage(actor, taskId, {
          clientMessageId: randomUUID(),
          content: 'Anexo de outro chat',
          stagedAttachmentIds: [foreignUpload.id],
        }),
        (err) => err.status === 403 && err.code === 'FORBIDDEN',
      );
    });

    it('rejeita anexo enviado por outro usuário (403)', async () => {
      const foreignUserUpload = createSampleUpload({ uploadedById: otherUserId });
      const { client } = makeMockPrisma([foreignUserUpload]);
      const service = createChatMessageService({ prisma: client });

      await assert.rejects(
        () => service.sendMessage(actor, taskId, {
          clientMessageId: randomUUID(),
          content: 'Anexo de outro usuario',
          stagedAttachmentIds: [foreignUserUpload.id],
        }),
        (err) => err.status === 403 && err.code === 'FORBIDDEN',
      );
    });

    it('rejeita anexo expirado (422)', async () => {
      const expiredUpload = createSampleUpload({
        expiresAt: new Date(Date.now() - 1000), // no passado
      });
      const { client } = makeMockPrisma([expiredUpload]);
      const service = createChatMessageService({ prisma: client });

      await assert.rejects(
        () => service.sendMessage(actor, taskId, {
          clientMessageId: randomUUID(),
          content: 'Anexo expirado',
          stagedAttachmentIds: [expiredUpload.id],
        }),
        (err) => err.status === 422 && err.code === 'CHAT_ATTACHMENT_EXPIRED',
      );
    });

    it('rejeita anexo com status inelegível (EXPIRED, REJECTED, FAILED) (422)', async () => {
      const failedUpload = createSampleUpload({ status: 'FAILED' });
      const { client } = makeMockPrisma([failedUpload]);
      const service = createChatMessageService({ prisma: client });

      await assert.rejects(
        () => service.sendMessage(actor, taskId, {
          clientMessageId: randomUUID(),
          content: 'Anexo falho',
          stagedAttachmentIds: [failedUpload.id],
        }),
        (err) => err.status === 422 && err.code === 'CHAT_ATTACHMENT_NOT_ELIGIBLE',
      );
    });

    it('rejeita anexo já promovido em outra mensagem (409)', async () => {
      const promotedUpload = createSampleUpload({ status: 'PROMOTED', messageId: randomUUID() });
      const { client } = makeMockPrisma([promotedUpload]);
      const service = createChatMessageService({ prisma: client });

      await assert.rejects(
        () => service.sendMessage(actor, taskId, {
          clientMessageId: randomUUID(),
          content: 'Anexo já promovido',
          stagedAttachmentIds: [promotedUpload.id],
        }),
        (err) => err.status === 409 && err.code === 'CHAT_ATTACHMENT_ALREADY_CLAIMED',
      );
    });

    it('rejeita anexo individual que excede 20MB (413)', async () => {
      const giantUpload = createSampleUpload({ sizeBytes: 25n * 1024n * 1024n }); // 25 MB
      const { client } = makeMockPrisma([giantUpload]);
      const service = createChatMessageService({ prisma: client });

      await assert.rejects(
        () => service.sendMessage(actor, taskId, {
          clientMessageId: randomUUID(),
          content: 'Arquivo gigante',
          stagedAttachmentIds: [giantUpload.id],
        }),
        (err) => err.status === 413 && err.code === 'CHAT_ATTACHMENT_TOO_LARGE',
      );
    });

    it('rejeita soma de anexos que excede 50MB (413)', async () => {
      const u1 = createSampleUpload({ sizeBytes: 18n * 1024n * 1024n });
      const u2 = createSampleUpload({ sizeBytes: 18n * 1024n * 1024n });
      const u3 = createSampleUpload({ sizeBytes: 18n * 1024n * 1024n }); // 18*3 = 54 MB > 50 MB
      const { client } = makeMockPrisma([u1, u2, u3]);
      const service = createChatMessageService({ prisma: client });

      await assert.rejects(
        () => service.sendMessage(actor, taskId, {
          clientMessageId: randomUUID(),
          content: 'Soma excede limite',
          stagedAttachmentIds: [u1.id, u2.id, u3.id],
        }),
        (err) => err.status === 413 && err.code === 'CHAT_ATTACHMENTS_TOTAL_TOO_LARGE',
      );
    });
  });

  describe('3. Fluxo de Publicação e Promoção de Anexos', () => {
    it('publica mensagem com anexos promovidos, status PUBLISHED e ordem preservada', async () => {
      const u1 = createSampleUpload({ originalName: 'primeiro.pdf', sizeBytes: 100n });
      const u2 = createSampleUpload({ originalName: 'segundo.png', sizeBytes: 200n });
      const { client, uploads, messageAttachments } = makeMockPrisma([u1, u2]);
      const storage = makeMockStorage();
      const service = createChatMessageService({ prisma: client, storage });

      const clientMessageId = randomUUID();
      const result = await service.sendMessage(actor, taskId, {
        clientMessageId,
        content: 'Aqui estão dois documentos.',
        stagedAttachmentIds: [u1.id, u2.id],
      });

      assert.equal(result.status, 'PUBLISHED');
      assert.equal(result.content, 'Aqui estão dois documentos.');
      assert.equal(result.attachments.length, 2);

      // Ordem preservada
      assert.equal(result.attachments[0].originalName, 'primeiro.pdf');
      assert.equal(result.attachments[1].originalName, 'segundo.png');

      // Status no banco atualizado para PROMOTED
      const updatedU1 = uploads.find((u) => u.id === u1.id);
      const updatedU2 = uploads.find((u) => u.id === u2.id);
      assert.equal(updatedU1.status, 'PROMOTED');
      assert.equal(updatedU2.status, 'PROMOTED');

      // Storage físico recebeu as chamadas de promoção
      assert.equal(storage.promoted.size, 2);
      assert.ok(storage.promoted.has(u1.stagingKey));
      assert.ok(storage.promoted.has(u2.stagingKey));

      // Registros imutáveis de chat_message_attachments gravados com posições corretas
      assert.equal(messageAttachments.length, 2);
      assert.equal(messageAttachments[0].position, 0);
      assert.equal(messageAttachments[0].sourceUploadId, u1.id);
      assert.equal(messageAttachments[1].position, 1);
      assert.equal(messageAttachments[1].sourceUploadId, u2.id);
    });

    it('publica mensagem somente com anexos (content null)', async () => {
      const u1 = createSampleUpload({ originalName: 'foto.jpg' });
      const { client } = makeMockPrisma([u1]);
      const storage = makeMockStorage();
      const service = createChatMessageService({ prisma: client, storage });

      const result = await service.sendMessage(actor, taskId, {
        clientMessageId: randomUUID(),
        content: '',
        stagedAttachmentIds: [u1.id],
      });

      assert.equal(result.status, 'PUBLISHED');
      assert.equal(result.content, null);
      assert.equal(result.attachments.length, 1);
      assert.equal(result.attachments[0].originalName, 'foto.jpg');
    });

    it('preserva fluxo direto para mensagem puramente textual sem acionar storage', async () => {
      const { client } = makeMockPrisma([]);
      const storage = makeMockStorage();
      const service = createChatMessageService({ prisma: client, storage });

      const result = await service.sendMessage(actor, taskId, {
        clientMessageId: randomUUID(),
        content: 'Mensagem sem nenhum anexo',
      });

      assert.equal(result.status, 'PUBLISHED');
      assert.equal(result.content, 'Mensagem sem nenhum anexo');
      assert.deepEqual(result.attachments, []);
      assert.equal(storage.promoted.size, 0);
    });
  });

  describe('4. Idempotência com Anexos', () => {
    it('replay com mesmo clientMessageId, mesmo conteúdo e mesmos anexos retorna a mesma mensagem', async () => {
      const u1 = createSampleUpload({ originalName: 'doc.pdf' });
      const { client } = makeMockPrisma([u1]);
      const storage = makeMockStorage();
      const service = createChatMessageService({ prisma: client, storage });

      const clientMessageId = randomUUID();
      const first = await service.sendMessage(actor, taskId, {
        clientMessageId,
        content: 'Envio único',
        stagedAttachmentIds: [u1.id],
      });

      const second = await service.sendMessage(actor, taskId, {
        clientMessageId,
        content: 'Envio único',
        stagedAttachmentIds: [u1.id],
      });

      assert.equal(first.id, second.id);
      assert.equal(first.sequenceNumber, second.sequenceNumber);
      assert.equal(first.attachments.length, 1);
      assert.equal(second.attachments.length, 1);
    });

    it('rejeita replay com mesmo clientMessageId mas anexos divergentes (409 Conflict)', async () => {
      const u1 = createSampleUpload({ originalName: 'doc1.pdf' });
      const u2 = createSampleUpload({ originalName: 'doc2.pdf' });
      const { client } = makeMockPrisma([u1, u2]);
      const storage = makeMockStorage();
      const service = createChatMessageService({ prisma: client, storage });

      const clientMessageId = randomUUID();
      await service.sendMessage(actor, taskId, {
        clientMessageId,
        content: 'Primeira tentativa',
        stagedAttachmentIds: [u1.id],
      });

      await assert.rejects(
        () => service.sendMessage(actor, taskId, {
          clientMessageId,
          content: 'Primeira tentativa',
          stagedAttachmentIds: [u2.id], // anexo diferente!
        }),
        (err) => err.status === 409 && err.code === 'IDEMPOTENCY_CONFLICT',
      );
    });

    it('rejeita replay com mesmo clientMessageId mas ordem alterada dos anexos (409 Conflict)', async () => {
      const u1 = createSampleUpload({ originalName: 'doc1.pdf' });
      const u2 = createSampleUpload({ originalName: 'doc2.pdf' });
      const { client } = makeMockPrisma([u1, u2]);
      const storage = makeMockStorage();
      const service = createChatMessageService({ prisma: client, storage });

      const clientMessageId = randomUUID();
      await service.sendMessage(actor, taskId, {
        clientMessageId,
        content: 'Ordem original',
        stagedAttachmentIds: [u1.id, u2.id],
      });

      await assert.rejects(
        () => service.sendMessage(actor, taskId, {
          clientMessageId,
          content: 'Ordem original',
          stagedAttachmentIds: [u2.id, u1.id], // ordem invertida!
        }),
        (err) => err.status === 409 && err.code === 'IDEMPOTENCY_CONFLICT',
      );
    });
  });
});
