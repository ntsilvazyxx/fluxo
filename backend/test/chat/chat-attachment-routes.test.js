import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, it } from 'node:test';
import { createTaskChatRouter } from '../../src/modules/chat/chat.routes.js';
import { signAccessToken } from '../../src/shared/security/tokens.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';

describe('Rotas HTTP de Staging de Anexos do Chat (Fase 5.1.2)', () => {
  const jwtAccessSecret = 'test_secret_for_chat_attachments_token_123456789';
  const config = {
    jwtAccessSecret,
    accessTokenTtlSeconds: 900,
    chatAttachmentStorageEnabled: true,
    chatAttachmentStorageMaxBytes: 20 * 1024 * 1024,
  };

  const userId = randomUUID();
  const sessionId = randomUUID();
  const taskId = randomUUID();
  const uploadId = randomUUID();

  const mockUser = {
    id: userId,
    name: 'Técnico de Teste',
    isActive: true,
    deletedAt: null,
    role: { code: 'TECHNICIAN' },
  };

  const mockSession = {
    id: sessionId,
    userId,
    user: mockUser,
  };

  const mockPrisma = {
    userSession: {
      findFirst: async ({ where }) => {
        if (where?.id === sessionId && where?.userId === userId) {
          return mockSession;
        }
        return null;
      },
    },
    task: { findUnique: async () => ({ id: taskId, team: { managers: [] } }) },
    chatConversation: { findUnique: async () => ({ id: randomUUID(), taskId }) },
    chatParticipant: { findUnique: async () => ({ id: randomUUID(), periods: [{ endedAt: null }] }) },
  };

  const makeApp = (attachmentServiceMock) => {
    const app = express();
    app.use(express.json());

    const router = createTaskChatRouter({
      prisma: mockPrisma,
      config,
      attachmentService: attachmentServiceMock,
    });

    app.use('/api/v1/tasks', router);
    app.use(errorHandler);
    return app;
  };

  it('exige autenticação obrigatória (401) em todos os endpoints de staging', async () => {
    const app = makeApp({});

    const postRes = await request(app).post(`/api/v1/tasks/${taskId}/chat/attachments/staged`);
    assert.equal(postRes.status, 401);
    assert.equal(postRes.body.error.code, 'AUTHENTICATION_REQUIRED');

    const getRes = await request(app).get(`/api/v1/tasks/${taskId}/chat/attachments/staged/${uploadId}`);
    assert.equal(getRes.status, 401);

    const deleteRes = await request(app).delete(`/api/v1/tasks/${taskId}/chat/attachments/staged/${uploadId}`);
    assert.equal(deleteRes.status, 401);
  });

  it('POST /attachments/staged retorna 400 quando o arquivo não é enviado', async () => {
    const token = await signAccessToken({ userId, sessionId, roleCode: 'TECHNICIAN' }, config);
    const app = makeApp({});

    const res = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
      .set('Authorization', `Bearer ${token}`)
      .field('clientUploadId', randomUUID());

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'CHAT_ATTACHMENT_REQUIRED');
  });

  it('POST /attachments/staged retorna 400 quando clientUploadId é omitido', async () => {
    const token = await signAccessToken({ userId, sessionId, roleCode: 'TECHNICIAN' }, config);
    const app = makeApp({});

    const res = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('conteudo de teste'), 'teste.txt');

    assert.equal(res.status, 400);
  });

  it('POST /attachments/staged realiza upload e retorna 201 com metadados apresentados', async () => {
    const token = await signAccessToken({ userId, sessionId, roleCode: 'TECHNICIAN' }, config);
    const clientUploadId = randomUUID();

    const mockService = {
      stage: async (_actor, _taskId, cId, file) => ({
        id: uploadId,
        originalName: file.originalname,
        mimeType: 'text/plain',
        sizeBytes: 16,
        status: 'READY',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      }),
    };

    const app = makeApp(mockService);

    const res = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
      .set('Authorization', `Bearer ${token}`)
      .field('clientUploadId', clientUploadId)
      .attach('file', Buffer.from('teste de arquivo'), 'documento.txt');

    assert.equal(res.status, 201);
    assert.equal(res.body.data.id, uploadId);
    assert.equal(res.body.data.originalName, 'documento.txt');
    assert.equal(res.body.data.status, 'READY');
    assert.equal(res.body.data.stagingKey, undefined, 'Não deve expor stagingKey');
    assert.equal(res.body.data.sha256, undefined, 'Não deve expor sha256');
  });

  it('GET /attachments/staged/:uploadId retorna 200 com os dados do upload', async () => {
    const token = await signAccessToken({ userId, sessionId, roleCode: 'TECHNICIAN' }, config);

    const mockService = {
      get: async () => ({
        id: uploadId,
        originalName: 'documento.txt',
        mimeType: 'text/plain',
        sizeBytes: 16,
        status: 'READY',
        expiresAt: new Date().toISOString(),
      }),
    };

    const app = makeApp(mockService);

    const res = await request(app)
      .get(`/api/v1/tasks/${taskId}/chat/attachments/staged/${uploadId}`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, uploadId);
    assert.equal(res.body.data.status, 'READY');
  });

  it('DELETE /attachments/staged/:uploadId cancela e retorna 200 com status EXPIRED', async () => {
    const token = await signAccessToken({ userId, sessionId, roleCode: 'TECHNICIAN' }, config);

    const mockService = {
      cancel: async () => ({
        id: uploadId,
        originalName: 'documento.txt',
        status: 'EXPIRED',
      }),
    };

    const app = makeApp(mockService);

    const res = await request(app)
      .delete(`/api/v1/tasks/${taskId}/chat/attachments/staged/${uploadId}`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'EXPIRED');
  });
});
