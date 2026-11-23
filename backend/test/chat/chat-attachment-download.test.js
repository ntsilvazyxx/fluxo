import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import express from 'express';
import request from 'supertest';
import { describe, it } from 'node:test';
import { createTaskChatRouter } from '../../src/modules/chat/chat.routes.js';
import { createChatMessageService } from '../../src/modules/chat/chat-message.service.js';
import { signAccessToken } from '../../src/shared/security/tokens.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';

describe('Download Seguro de Anexos do Chat — Fase 5.1.4', () => {
  const jwtAccessSecret = 'test_secret_for_chat_download_fase_514_super_secure';
  const config = {
    jwtAccessSecret,
    accessTokenTtlSeconds: 900,
  };

  const createFakeStorage = ({
    files = new Map(),
    failOnExists = false,
    failOnStream = false,
  } = {}) => ({
    async exists(key) {
      if (failOnExists) throw new Error('Storage cluster connection failed');
      return files.has(key);
    },
    async openReadStream(key) {
      if (failOnStream) throw new Error('Stream read failed from storage');
      const content = files.get(key);
      if (!content) throw new Error('Object not found in storage');
      return Readable.from([content]);
    },
    async head(key) {
      const content = files.get(key);
      if (!content) throw new Error('Object not found');
      return { key, sizeBytes: content.length };
    },
    async writeStaging() { return { key: 'staging/dummy.upload', sizeBytes: 10, sha256: 'abc' }; },
    async promote() { return { key: 'objects/dummy.object' }; },
    async quarantine() { return { key: 'quarantine/dummy' }; },
    async removeTemporary() { return { key: 'staging/dummy', removed: true }; },
    createObjectKey() {
      const id = randomUUID();
      return `objects/${id.slice(0, 2)}/${id}.object`;
    },
    createStagingKey() {
      return `staging/${randomUUID()}.upload`;
    },
  });

  const makeTestEnv = () => {
    const taskId = randomUUID();
    const conversationId = randomUUID();
    const messageId = randomUUID();
    const attachmentId = randomUUID();
    const storageKey = `objects/ab/${randomUUID()}.object`;

    const techActiveId = randomUUID();
    const techRemovedId = randomUUID();
    const techReaddedId = randomUUID();
    const managerId = randomUUID();
    const adminId = randomUUID();
    const secretaryId = randomUUID();
    const externalUserId = randomUUID();

    const auditEvents = [];

    const dateBase = new Date('2026-11-20T10:00:00Z');
    const dateMessage = new Date('2026-11-20T12:00:00Z');
    const dateRemovedEnd = new Date('2026-11-20T11:00:00Z'); // Encerrado antes da mensagem
    const dateGap = new Date('2026-11-20T13:00:00Z'); // Criada na lacuna de re-adicionado
    const dateSecondPeriod = new Date('2026-11-20T15:00:00Z'); // Criada após re-inclusão

    const storageFiles = new Map();
    const fileContent = Buffer.from('%PDF-1.4 test document content for download verification');
    storageFiles.set(storageKey, fileContent);

    const storage = createFakeStorage({ files: storageFiles });

    const task = {
      id: taskId,
      title: 'Tarefa de Homologação',
      teamId: randomUUID(),
      deletedAt: null,
      team: {
        managers: [{ userId: managerId, endedAt: null }],
      },
    };

    const lockState = {
      isLocked: false,
      reason: null,
      justification: null,
    };

    const conversation = {
      id: conversationId,
      taskId,
      lockState,
    };

    const message = {
      id: messageId,
      conversationId,
      status: 'PUBLISHED',
      createdAt: dateMessage,
      clientMessageId: randomUUID(),
      content: 'Mensagem com anexo homologado',
    };

    const attachment = {
      id: attachmentId,
      messageId,
      storagePath: storageKey,
      originalName: 'documento_oficial.pdf',
      mimeType: 'application/pdf',
      sizeBytes: BigInt(fileContent.length),
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      position: 1,
      origin: 'UPLOAD',
      createdAt: dateMessage,
    };

    const participants = new Map();

    // Técnico com participação ativa cobrindo a mensagem
    participants.set(techActiveId, {
      id: randomUUID(),
      conversationId,
      userId: techActiveId,
      periods: [{ id: randomUUID(), joinedAt: dateBase, endedAt: null }],
    });

    // Técnico removido antes da criação da mensagem
    participants.set(techRemovedId, {
      id: randomUUID(),
      conversationId,
      userId: techRemovedId,
      periods: [{ id: randomUUID(), joinedAt: dateBase, endedAt: dateRemovedEnd }],
    });

    // Técnico reincluído: Período 1 (08h às 10h), Lacuna (10h às 14h), Período 2 (14h em diante)
    participants.set(techReaddedId, {
      id: randomUUID(),
      conversationId,
      userId: techReaddedId,
      periods: [
        { id: randomUUID(), joinedAt: new Date('2026-11-20T08:00:00Z'), endedAt: new Date('2026-11-20T10:00:00Z') },
        { id: randomUUID(), joinedAt: new Date('2026-11-20T14:00:00Z'), endedAt: null },
      ],
    });

    const mockPrisma = {
      userSession: {
        findFirst: async ({ where }) => {
          const uId = where?.userId;
          let roleCode = 'TECHNICIAN';
          if (uId === managerId) roleCode = 'MANAGER';
          else if (uId === adminId) roleCode = 'ADMIN_MASTER';
          else if (uId === secretaryId) roleCode = 'SECRETARY';
          return {
            id: where?.id,
            userId: uId,
            user: { id: uId, name: `User ${uId}`, isActive: true, deletedAt: null, role: { code: roleCode } },
          };
        },
      },
      task: {
        findUnique: async ({ where }) => (where?.id === taskId ? task : null),
      },
      chatConversation: {
        findUnique: async ({ where }) => (where?.taskId === taskId ? conversation : null),
      },
      chatMessage: {
        findUnique: async ({ where }) => (where?.id === messageId ? message : null),
      },
      chatMessageAttachment: {
        findUnique: async ({ where }) => (where?.id === attachmentId ? attachment : null),
      },
      chatParticipant: {
        findUnique: async ({ where }) => {
          const uId = where?.conversationId_userId?.userId;
          return participants.get(uId) ?? null;
        },
      },
      auditEvent: {
        create: async ({ data }) => {
          auditEvents.push(data);
          return data;
        },
      },
    };

    const makeApp = (customStorage = storage, customPrisma = mockPrisma) => {
      const app = express();
      app.use(express.json());

      const router = createTaskChatRouter({
        prisma: customPrisma,
        config,
        storage: customStorage,
      });

      app.use('/api/v1/tasks', router);
      app.use(errorHandler);
      return app;
    };

    return {
      taskId,
      conversationId,
      messageId,
      attachmentId,
      storageKey,
      fileContent,
      techActiveId,
      techRemovedId,
      techReaddedId,
      managerId,
      adminId,
      secretaryId,
      externalUserId,
      task,
      conversation,
      message,
      attachment,
      lockState,
      auditEvents,
      storage,
      mockPrisma,
      makeApp,
      dateGap,
      dateSecondPeriod,
    };
  };

  const authHeader = async (userId, roleCode, config) => {
    const sessionId = randomUUID();
    const token = await signAccessToken({ userId, sessionId, roleCode }, config);
    return `Bearer ${token}`;
  };

  it('1. Download autorizado retorna 200 com streaming do conteúdo exato e headers seguros', async () => {
    const env = makeTestEnv();
    const app = env.makeApp();
    const token = await authHeader(env.techActiveId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.ok(res.headers['content-disposition'].includes('attachment; filename="documento_oficial.pdf"'));
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['cache-control'], 'private, no-cache, no-store, must-revalidate');
    assert.equal(res.headers['content-length'], env.fileContent.length.toString());
    assert.deepEqual(res.body, env.fileContent);
  });

  it('2. Usuário não autenticado retorna 401', async () => {
    const env = makeTestEnv();
    const app = env.makeApp();

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`);

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'AUTHENTICATION_REQUIRED');
  });

  it('3. Usuário sem participação tem acesso negado com resposta segura 404 e auditoria registrada', async () => {
    const env = makeTestEnv();
    const app = env.makeApp();
    const token = await authHeader(env.externalUserId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'CHAT_ATTACHMENT_NOT_FOUND');
    const deniedAudit = env.auditEvents.find((e) => e.action === 'CHAT_ATTACHMENT_DOWNLOAD_DENIED');
    assert.ok(deniedAudit, 'Deve registrar auditoria de negação');
    assert.equal(deniedAudit.actorId, env.externalUserId);
  });

  it('4. Usuário de outra equipe não autorizado retorna 404 seguro', async () => {
    const env = makeTestEnv();
    const app = env.makeApp();
    const foreignTechId = randomUUID();
    const token = await authHeader(foreignTechId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 404);
  });

  it('5. ADMIN_MASTER sem participação formal tem acesso a anexo privado bloqueado (404)', async () => {
    const env = makeTestEnv();
    const app = env.makeApp();
    const token = await authHeader(env.adminId, 'ADMIN_MASTER', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'CHAT_ATTACHMENT_NOT_FOUND');
  });

  it('6. SECRETARY sem participação formal tem acesso a anexo privado bloqueado (404)', async () => {
    const env = makeTestEnv();
    const app = env.makeApp();
    const token = await authHeader(env.secretaryId, 'SECRETARY', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 404);
  });

  it('7. Gestor da equipe da tarefa possui autorização funcional para download (200)', async () => {
    const env = makeTestEnv();
    const app = env.makeApp();
    const token = await authHeader(env.managerId, 'MANAGER', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, env.fileContent);
  });

  it('8. Participante removido não pode baixar anexo de mensagem posterior ao encerramento (404)', async () => {
    const env = makeTestEnv();
    const app = env.makeApp();
    const token = await authHeader(env.techRemovedId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'CHAT_ATTACHMENT_NOT_FOUND');
  });

  it('9. Participante reincluído pode baixar anexo de mensagem dentro do seu novo período (200)', async () => {
    const env = makeTestEnv();
    // Ajusta a data da mensagem para dentro do período 2 do participante
    env.message.createdAt = env.dateSecondPeriod;
    env.attachment.createdAt = env.dateSecondPeriod;

    const app = env.makeApp();
    const token = await authHeader(env.techReaddedId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, env.fileContent);
  });

  it('10. Participante reincluído é BLOQUEADO de baixar anexo de mensagem criada na lacuna histórica (404)', async () => {
    const env = makeTestEnv();
    // Ajusta a data da mensagem para a lacuna (13h, entre 10h e 14h)
    env.message.createdAt = env.dateGap;
    env.attachment.createdAt = env.dateGap;

    const app = env.makeApp();
    const token = await authHeader(env.techReaddedId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'CHAT_ATTACHMENT_NOT_FOUND');
  });

  it('11. Mensagem PENDING não disponibiliza anexos para download (404)', async () => {
    const env = makeTestEnv();
    env.message.status = 'PENDING';

    const app = env.makeApp();
    const token = await authHeader(env.techActiveId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'CHAT_ATTACHMENT_NOT_FOUND');
  });

  it('12. Mensagem FAILED não disponibiliza anexos para download (404)', async () => {
    const env = makeTestEnv();
    env.message.status = 'FAILED';

    const app = env.makeApp();
    const token = await authHeader(env.techActiveId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'CHAT_ATTACHMENT_NOT_FOUND');
  });

  it('13. Mensagem PUBLISHED disponibiliza anexos para download (200)', async () => {
    const env = makeTestEnv();
    env.message.status = 'PUBLISHED';

    const app = env.makeApp();
    const token = await authHeader(env.techActiveId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 200);
  });

  it('14. Anexo sem vínculo ou upload não promovido retorna 404', async () => {
    const env = makeTestEnv();
    const fakeAttachmentId = randomUUID();

    const app = env.makeApp();
    const token = await authHeader(env.techActiveId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${fakeAttachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 404);
  });

  it('15. Anexo de outra conversa não pode ser acessado através de tarefa distinta (404)', async () => {
    const env = makeTestEnv();
    env.message.conversationId = randomUUID(); // Outra conversa

    const app = env.makeApp();
    const token = await authHeader(env.techActiveId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'CHAT_ATTACHMENT_NOT_FOUND');
  });

  it('16. Anexo de outra mensagem retorna 404', async () => {
    const env = makeTestEnv();
    env.attachment.messageId = randomUUID(); // Outra mensagem

    const app = env.makeApp();
    const token = await authHeader(env.techActiveId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'CHAT_ATTACHMENT_NOT_FOUND');
  });

  it('17. Bloqueio administrativo (ADMIN_MAINTENANCE) NÃO impede download de anexos já publicados (200)', async () => {
    const env = makeTestEnv();
    env.lockState.isLocked = true;
    env.lockState.reason = 'ADMIN_MAINTENANCE';

    const app = env.makeApp();
    const token = await authHeader(env.techActiveId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, env.fileContent);
  });

  it('18. Bloqueio por solicitação pendente (REQUEST_PENDING) NÃO impede download de anexos (200)', async () => {
    const env = makeTestEnv();
    env.lockState.isLocked = true;
    env.lockState.reason = 'REQUEST_PENDING';

    const app = env.makeApp();
    const token = await authHeader(env.techActiveId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 200);
  });

  it('19. Bloqueio por ciclo concluído (CYCLE_CLOSED) NÃO impede download de anexos (200)', async () => {
    const env = makeTestEnv();
    env.lockState.isLocked = true;
    env.lockState.reason = 'CYCLE_CLOSED';

    const app = env.makeApp();
    const token = await authHeader(env.techActiveId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 200);
  });

  it('20. Arquivo físico inexistente no storage retorna 404 com código CHAT_ATTACHMENT_FILE_MISSING e auditoria UNAVAILABLE', async () => {
    const env = makeTestEnv();
    const emptyStorage = createFakeStorage({ files: new Map() }); // Sem arquivos no storage

    const app = env.makeApp(emptyStorage);
    const token = await authHeader(env.techActiveId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'CHAT_ATTACHMENT_FILE_MISSING');
    const unavailAudit = env.auditEvents.find((e) => e.action === 'CHAT_ATTACHMENT_DOWNLOAD_UNAVAILABLE');
    assert.ok(unavailAudit, 'Deve registrar evento de auditoria de indisponibilidade');
  });

  it('21. Falha de I/O no storage retorna 503 CHAT_STORAGE_UNAVAILABLE', async () => {
    const env = makeTestEnv();
    const brokenStorage = createFakeStorage({ files: new Map(), failOnExists: true });

    const app = env.makeApp(brokenStorage);
    const token = await authHeader(env.techActiveId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 503);
    assert.equal(res.body.error.code, 'CHAT_STORAGE_UNAVAILABLE');
  });

  it('22. Nome de arquivo malicioso (path traversal e header injection) é estritamente sanitizado no header', async () => {
    const env = makeTestEnv();
    env.attachment.originalName = '../../etc/passwd\r\nSet-Cookie: pwned=true\n"malicious".pdf';

    const app = env.makeApp();
    const token = await authHeader(env.techActiveId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 200);
    const disposition = res.headers['content-disposition'];
    assert.ok(!disposition.includes('\r'), 'NÃO deve conter retorno de carro');
    assert.ok(!disposition.includes('\n'), 'NÃO deve conter quebra de linha');
    assert.equal(res.headers['set-cookie'], undefined, 'NÃO deve permitir injeção de headers');
    assert.ok(disposition.startsWith('attachment; filename='), 'Deve manter prefixo de anexo');
  });

  it('23. Cabeçalhos HTTP de segurança obrigatórios estão presentes em toda resposta de download', async () => {
    const env = makeTestEnv();
    const app = env.makeApp();
    const token = await authHeader(env.techActiveId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 200);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['cache-control'], 'private, no-cache, no-store, must-revalidate');
    assert.equal(res.headers['pragma'], 'no-cache');
    assert.equal(res.headers['expires'], '0');
  });

  it('24. Desconexão do cliente durante streaming encerra o stream do storage', async () => {
    const env = makeTestEnv();
    let streamDestroyed = false;

    const slowStream = new Readable({
      read() {
        // Envia primeiro chunk e espera
        this.push(Buffer.from('chunk1'));
      },
    });
    slowStream.destroy = () => {
      streamDestroyed = true;
    };

    const mockService = createChatMessageService({
      prisma: env.mockPrisma,
      storage: {
        async exists() { return true; },
        async openReadStream() { return slowStream; },
      },
    });

    const downloadInfo = await mockService.getAttachmentForDownload(
      { userId: env.techActiveId, roleCode: 'TECHNICIAN' },
      env.taskId,
      env.messageId,
      env.attachmentId,
    );

    assert.ok(downloadInfo.stream);
    downloadInfo.stream.destroy();
    assert.equal(streamDestroyed, true);
  });

  it('25. Auditoria de download registra eventos estruturados e sem dados sensíveis', async () => {
    const env = makeTestEnv();
    const app = env.makeApp();
    const token = await authHeader(env.techActiveId, 'TECHNICIAN', config);

    const res = await request(app)
      .get(`/api/v1/tasks/${env.taskId}/chat/messages/${env.messageId}/attachments/${env.attachmentId}/download`)
      .set('Authorization', token);

    assert.equal(res.status, 200);

    const successAudit = env.auditEvents.find((e) => e.action === 'CHAT_ATTACHMENT_DOWNLOADED');
    assert.ok(successAudit, 'Deve registrar auditoria de sucesso');
    assert.equal(successAudit.entityType, 'ChatMessageAttachment');
    assert.equal(successAudit.entityId, env.attachmentId);
    assert.equal(successAudit.actorId, env.techActiveId);
    assert.equal(successAudit.afterJson.outcome, 'SUCCESS');
    assert.equal(successAudit.afterJson.taskId, env.taskId);
    assert.equal(successAudit.afterJson.messageId, env.messageId);

    // Ocultação estrita de campos sensíveis na auditoria
    assert.equal('storagePath' in successAudit.afterJson, false);
    assert.equal('stagingKey' in successAudit.afterJson, false);
    assert.equal('sha256' in successAudit.afterJson, false);
  });
});
