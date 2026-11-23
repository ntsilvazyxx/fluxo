import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { createTaskChatRouter } from '../../src/modules/chat/chat.routes.js';
import { createLocalChatAttachmentStorage } from '../../src/modules/chat/chat-attachment.local-storage.js';
import { createChatAttachmentService } from '../../src/modules/chat/chat-attachment.service.js';
import { signAccessToken } from '../../src/shared/security/tokens.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';

describe('Fase 5.1.6 — Homologação Integrada do Backend de Anexos do Chat (HTTP Ponta a Ponta)', () => {
  let tmpRoot;
  let storageRoot;
  let storage;
  let mockPrisma;
  let dbData;
  let config;
  let jwtSecret;
  let app;

  // Entidades sintéticas
  const roleAdminId = 'role-admin';
  const roleSecretaryId = 'role-sec';
  const roleManagerId = 'role-mgr';
  const roleTechId = 'role-tech';

  const userAdmin = { id: randomUUID(), name: 'Admin Master', roleId: roleAdminId, role: { code: 'ADMIN_MASTER' } };
  const userSecretary = { id: randomUUID(), name: 'Secretário', roleId: roleSecretaryId, role: { code: 'SECRETARY' } };
  const userManager = { id: randomUUID(), name: 'Gestor da Equipe', roleId: roleManagerId, role: { code: 'MANAGER' } };
  const userOtherManager = { id: randomUUID(), name: 'Outro Gestor', roleId: roleManagerId, role: { code: 'MANAGER' } };
  const userTech1 = { id: randomUUID(), name: 'Técnico 1', roleId: roleTechId, role: { code: 'TECHNICIAN' } };
  const userTech2 = { id: randomUUID(), name: 'Técnico 2', roleId: roleTechId, role: { code: 'TECHNICIAN' } };

  const teamId = randomUUID();
  const taskId = randomUUID();
  const otherTaskId = randomUUID();
  const cycleId = randomUUID();
  const conversationId = randomUUID();
  const otherConversationId = randomUUID();

  const mockScanner = {
    isAvailable: async () => true,
    scanFile: async () => ({ result: 'CLEAN' }),
  };

  const tokenFor = async (user) => {
    const sessionId = randomUUID();
    dbData.userSessions.push({
      id: sessionId,
      userId: user.id,
      user: { ...user, isActive: true, deletedAt: null },
    });
    return signAccessToken({ userId: user.id, sessionId, roleCode: user.roleCode }, config);
  };

  beforeEach(async () => {
    tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'seaf-e2e-root-'));
    storageRoot = path.join(tmpRoot, 'storage');
    storage = createLocalChatAttachmentStorage({ rootPath: storageRoot });

    jwtSecret = 'super_secret_for_e2e_testing_purpose_only_1234567890';
    config = {
      jwtAccessSecret: jwtSecret,
      accessTokenTtlSeconds: 3600,
      chatAttachmentStorageEnabled: true,
      chatAttachmentStorageMaxBytes: 20 * 1024 * 1024,
      chatAttachmentStoragePath: storageRoot,
    };

    // Banco de dados simulado com controle de estado transacional
    dbData = {
      users: [userAdmin, userSecretary, userManager, userOtherManager, userTech1, userTech2],
      userSessions: [],
      tasks: [
        {
          id: taskId,
          deletedAt: null,
          currentCycleId: cycleId,
          team: {
            id: teamId,
            managers: [{ userId: userManager.id, endedAt: null }],
          },
        },
        {
          id: otherTaskId,
          deletedAt: null,
          currentCycleId: cycleId,
          team: {
            id: randomUUID(),
            managers: [{ userId: userOtherManager.id, endedAt: null }],
          },
        },
      ],
      chatConversations: [
        { id: conversationId, taskId, lockState: { isLocked: false, reason: null } },
        { id: otherConversationId, taskId: otherTaskId, lockState: { isLocked: false, reason: null } },
      ],
      chatParticipants: [
        {
          id: randomUUID(),
          conversationId,
          userId: userTech1.id,
          periods: [{ joinedAt: new Date(Date.now() - 3600_000), endedAt: null }],
        },
        {
          id: randomUUID(),
          conversationId,
          userId: userTech2.id,
          periods: [{ joinedAt: new Date(Date.now() - 3600_000), endedAt: null }],
        },
      ],
      chatMessages: [],
      chatMessageAttachments: [],
      chatAttachmentUploads: [],
      chatLockStates: [
        { conversationId, isLocked: false, reason: null },
        { conversationId: otherConversationId, isLocked: false, reason: null },
      ],
      auditEvents: [],
    };

    mockPrisma = {
      user: {
        findUnique: async ({ where }) => dbData.users.find((u) => u.id === where.id),
      },
      userSession: {
        findFirst: async ({ where }) => dbData.userSessions.find((s) => s.id === where.id && s.userId === where.userId),
      },
      task: {
        findUnique: async ({ where }) => dbData.tasks.find((t) => t.id === where.id && t.deletedAt === null),
      },
      chatConversation: {
        findUnique: async ({ where }) => {
          const conv = dbData.chatConversations.find((c) => c.taskId === where.taskId || c.id === where.id);
          if (!conv) return null;
          const lock = dbData.chatLockStates.find((l) => l.conversationId === conv.id);
          return { ...conv, lockState: lock || { isLocked: false } };
        },
      },
      chatParticipant: {
        findUnique: async ({ where }) => {
          if (where.conversationId_userId) {
            return dbData.chatParticipants.find((p) =>
              p.conversationId === where.conversationId_userId.conversationId &&
              p.userId === where.conversationId_userId.userId,
            );
          }
          return dbData.chatParticipants.find((p) => p.id === where.id);
        },
        findMany: async ({ where }) => dbData.chatParticipants.filter((p) => p.conversationId === where.conversationId),
      },
      chatMessage: {
        findMany: async ({ where, take, orderBy }) => {
          let list = dbData.chatMessages.filter((m) => {
            if (where.conversationId && m.conversationId !== where.conversationId) return false;
            if (where.status && m.status !== where.status) return false;
            return true;
          });
          if (orderBy?.sequenceNumber === 'asc') list.sort((a, b) => Number(a.sequenceNumber - b.sequenceNumber));
          if (take) list = list.slice(0, take);
          return list.map((m) => ({
            ...m,
            author: dbData.users.find((u) => u.id === m.authorId),
            attachments: dbData.chatMessageAttachments.filter((a) => a.messageId === m.id),
          }));
        },
        findFirst: async ({ where, orderBy }) => {
          let list = dbData.chatMessages.filter((m) => {
            if (where?.conversationId && m.conversationId !== where.conversationId) return false;
            return true;
          });
          if (orderBy?.sequenceNumber === 'desc') {
            list = [...list].sort((a, b) => (BigInt(b.sequenceNumber) > BigInt(a.sequenceNumber) ? 1 : -1));
          }
          return list[0] || null;
        },
        findUnique: async ({ where }) => {
          let m = null;
          if (where.id) {
            m = dbData.chatMessages.find((item) => item.id === where.id);
          } else if (where.conversationId_clientMessageId) {
            const key = where.conversationId_clientMessageId;
            m = dbData.chatMessages.find((item) =>
              item.conversationId === key.conversationId &&
              item.clientMessageId === key.clientMessageId,
            );
          }
          if (!m) return null;
          return {
            ...m,
            author: dbData.users.find((u) => u.id === m.authorId),
            attachments: dbData.chatMessageAttachments.filter((a) => a.messageId === m.id),
            conversation: dbData.chatConversations.find((c) => c.id === m.conversationId),
          };
        },
        count: async ({ where }) => dbData.chatMessages.filter((m) => {
          if (where.conversationId && m.conversationId !== where.conversationId) return false;
          if (where.status && m.status !== where.status) return false;
          return true;
        }).length,
        create: async ({ data }) => {
          const entry = {
            ...data,
            author: dbData.users.find((u) => u.id === data.authorId),
            attachments: [],
            conversation: dbData.chatConversations.find((c) => c.id === data.conversationId),
          };
          dbData.chatMessages.push(entry);
          return entry;
        },
        update: async ({ where, data }) => {
          const m = dbData.chatMessages.find((item) => item.id === where.id);
          if (!m) throw new Error('Message not found');
          Object.assign(m, data);
          return {
            ...m,
            author: dbData.users.find((u) => u.id === m.authorId),
            attachments: dbData.chatMessageAttachments.filter((a) => a.messageId === m.id),
            conversation: dbData.chatConversations.find((c) => c.id === m.conversationId),
          };
        },
      },
      chatMessageAttachment: {
        findMany: async ({ where }) => dbData.chatMessageAttachments.filter((a) => {
          if (where.messageId && a.messageId !== where.messageId) return false;
          return true;
        }),
        findFirst: async ({ where }) => dbData.chatMessageAttachments.find((a) => {
          if (where.id && a.id !== where.id) return false;
          if (where.messageId && a.messageId !== where.messageId) return false;
          return true;
        }),
        findUnique: async ({ where }) => {
          if (where.id) return dbData.chatMessageAttachments.find((a) => a.id === where.id) || null;
          return null;
        },
        create: async ({ data }) => {
          dbData.chatMessageAttachments.push({ ...data });
          return { ...data };
        },
      },
      chatAttachmentUpload: {
        findUnique: async ({ where }) => {
          if (where.id) return dbData.chatAttachmentUploads.find((u) => u.id === where.id) || null;
          if (where.conversationId_uploadedById_clientUploadId) {
            const key = where.conversationId_uploadedById_clientUploadId;
            return dbData.chatAttachmentUploads.find((u) =>
              u.conversationId === key.conversationId &&
              u.uploadedById === key.uploadedById &&
              u.clientUploadId === key.clientUploadId,
            ) || null;
          }
          return null;
        },
        findMany: async ({ where }) => dbData.chatAttachmentUploads.filter((u) => {
          if (where.id?.in && !where.id.in.includes(u.id)) return false;
          if (where.messageId && u.messageId !== where.messageId) return false;
          if (where.status && u.status !== where.status) return false;
          return true;
        }),
        create: async ({ data }) => {
          const entry = { ...data, createdAt: new Date(), updatedAt: new Date() };
          dbData.chatAttachmentUploads.push(entry);
          return entry;
        },
        update: async ({ where, data }) => {
          const u = dbData.chatAttachmentUploads.find((item) => item.id === where.id);
          if (!u) throw new Error('Upload not found');
          Object.assign(u, data, { updatedAt: new Date() });
          return u;
        },
        aggregate: async ({ where }) => {
          let sum = 0;
          for (const u of dbData.chatAttachmentUploads) {
            if (where.uploadedById && u.uploadedById !== where.uploadedById) continue;
            if (where.conversationId && u.conversationId !== where.conversationId) continue;
            if (where.status?.in && !where.status.in.includes(u.status)) continue;
            if (where.expiresAt?.gt && !(u.expiresAt > where.expiresAt.gt)) continue;
            sum += Number(u.sizeBytes || 0);
          }
          return { _sum: { sizeBytes: sum } };
        },
      },
      auditEvent: {
        create: async ({ data }) => {
          dbData.auditEvents.push({ ...data });
          return data;
        },
      },
      $queryRawUnsafe: async () => [],
      $transaction: async (op) => (typeof op === 'function' ? op(mockPrisma) : Promise.all(op)),
    };

    const attachmentService = createChatAttachmentService({
      prisma: mockPrisma,
      storage,
      scanner: mockScanner,
      enabled: true,
      ttlMinutes: 1440,
      maxBytes: 20 * 1024 * 1024,
      userQuotaBytes: 100 * 1024 * 1024,
      conversationQuotaBytes: 250 * 1024 * 1024,
    });

    app = express();
    app.use(express.json());
    app.use('/api/v1/tasks', createTaskChatRouter({
      prisma: mockPrisma,
      config,
      storage,
      scanner: mockScanner,
      attachmentService,
    }));
    app.use(errorHandler);
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  // Cenário 1 — Mensagem com texto e um anexo (Fluxo Completo)
  it('Cenário 1: Fluxo ponta a ponta completo de upload, publicação, listagem e download', async () => {
    const token = await tokenFor(userTech1);
    const fileBytes = Buffer.from('Relatorio de Atividades SEAF MT');

    // 1. Upload para staging
    const uploadRes = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
      .set('Authorization', `Bearer ${token}`)
      .field('clientUploadId', randomUUID())
      .attach('attachment', fileBytes, 'relatorio.txt');

    assert.equal(uploadRes.status, 201);
    assert.equal(uploadRes.body.data.status, 'READY');
    assert.equal(uploadRes.body.data.originalName, 'relatorio.txt');
    const uploadId = uploadRes.body.data.id;

    // 2. Envio de mensagem com anexo
    const clientMessageId = randomUUID();
    const sendRes = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: 'Segue o relatório técnico em anexo.',
        clientMessageId,
        stagedAttachmentIds: [uploadId],
      });

    assert.equal(sendRes.status, 201);
    assert.equal(sendRes.body.data.status, 'PUBLISHED');
    assert.equal(sendRes.body.data.content, 'Segue o relatório técnico em anexo.');
    assert.equal(sendRes.body.data.attachments.length, 1);
    const attachment = sendRes.body.data.attachments[0];
    assert.equal(attachment.originalName, 'relatorio.txt');
    assert.equal(attachment.position, 0);

    // 3. Listagem de mensagens
    const listRes = await request(app)
      .get(`/api/v1/tasks/${taskId}/chat/messages`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.data.items.length, 1);
    assert.equal(listRes.body.data.items[0].attachments.length, 1);

    // 4. Download autorizado do anexo
    const messageId = sendRes.body.data.id;
    const downloadRes = await request(app)
      .get(`/api/v1/tasks/${taskId}/chat/messages/${messageId}/attachments/${attachment.id}/download`)
      .set('Authorization', `Bearer ${token}`)
      .buffer();

    assert.equal(downloadRes.status, 200);
    assert.equal(downloadRes.headers['content-type'], 'text/plain');
    assert.match(downloadRes.headers['content-disposition'], /attachment; filename="relatorio\.txt"/);
    assert.equal(downloadRes.headers['x-content-type-options'], 'nosniff');
    assert.equal(downloadRes.headers['cache-control'], 'private, no-cache, no-store, must-revalidate');
    assert.equal(downloadRes.text, fileBytes.toString());
    assert.deepEqual(Buffer.from(downloadRes.text), fileBytes);
  });

  // Cenário 2 — Mensagem somente com anexo (sem texto)
  it('Cenário 2: Publica com sucesso mensagem contendo apenas anexo (content ausente ou nulo)', async () => {
    const token = await tokenFor(userTech1);
    const fileBytes = Buffer.from('Conteúdo isolado em anexo');

    const uploadRes = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
      .set('Authorization', `Bearer ${token}`)
      .field('clientUploadId', randomUUID())
      .attach('attachment', fileBytes, 'foto.txt');

    assert.equal(uploadRes.status, 201);

    const sendRes = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientMessageId: randomUUID(),
        stagedAttachmentIds: [uploadRes.body.data.id],
      });

    assert.equal(sendRes.status, 201);
    assert.equal(sendRes.body.data.content, null);
    assert.equal(sendRes.body.data.attachments.length, 1);
  });

  // Cenário 3 — Limite máximo de cinco anexos com ordem preservada
  it('Cenário 3: Publica mensagem com exatamente 5 anexos preservando posições 0..4', async () => {
    const token = await tokenFor(userTech1);
    const stagedIds = [];

    for (let i = 0; i < 5; i++) {
      const up = await request(app)
        .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
        .set('Authorization', `Bearer ${token}`)
        .field('clientUploadId', randomUUID())
        .attach('attachment', Buffer.from(`Arquivo numero ${i}`), `anexo_${i}.txt`);
      assert.equal(up.status, 201);
      stagedIds.push(up.body.data.id);
    }

    const sendRes = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: 'Cinco arquivos anexados',
        clientMessageId: randomUUID(),
        stagedAttachmentIds: stagedIds,
      });

    assert.equal(sendRes.status, 201);
    assert.equal(sendRes.body.data.attachments.length, 5);
    for (let i = 0; i < 5; i++) {
      assert.equal(sendRes.body.data.attachments[i].position, i);
      assert.equal(sendRes.body.data.attachments[i].originalName, `anexo_${i}.txt`);
    }
  });

  // Cenário 4 — Limites excedidos e rejeição controlada
  it('Cenário 4: Rejeita mensagem com mais de 5 anexos ou com identificadores duplicados', async () => {
    const token = await tokenFor(userTech1);

    // Mais de 5 anexos
    const sixIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const resOverCount = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: '6 anexos',
        clientMessageId: randomUUID(),
        stagedAttachmentIds: sixIds,
      });
    assert.equal(resOverCount.status, 400);
    assert.equal(resOverCount.body.error.code, 'VALIDATION_ERROR');

    // IDs duplicados
    const dupId = randomUUID();
    const resDup = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: 'anexo repetido',
        clientMessageId: randomUUID(),
        stagedAttachmentIds: [dupId, dupId],
      });
    assert.equal(resDup.status, 400);
    assert.equal(resDup.body.error.code, 'VALIDATION_ERROR');
  });

  // Cenário 5 — Tipos permitidos com validação de conteúdo real
  it('Cenário 5: Aceita formatos permitidos (PNG e PDF estruturado)', async () => {
    const token = await tokenFor(userTech1);

    // PNG autêntico
    const validPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
      0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54,
      0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
      0xae, 0x42, 0x60, 0x82,
    ]);

    const pngRes = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
      .set('Authorization', `Bearer ${token}`)
      .field('clientUploadId', randomUUID())
      .attach('attachment', validPng, 'imagem.png');

    assert.equal(pngRes.status, 201);
    assert.equal(pngRes.body.data.mimeType, 'image/png');

    // PDF estruturado
    const validPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
      '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n' +
      'xref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n' +
      'trailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n115\n%%EOF',
    );

    const pdfRes = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
      .set('Authorization', `Bearer ${token}`)
      .field('clientUploadId', randomUUID())
      .attach('attachment', validPdf, 'documento.pdf');

    assert.equal(pdfRes.status, 201);
    assert.equal(pdfRes.body.data.mimeType, 'application/pdf');
  });

  // Cenário 6 — Rejeição de tipos proibidos e conteúdo incompatível
  it('Cenário 6: Rejeita extensão proibida (.exe) e arquivo com conteúdo corrompido/incompatível', async () => {
    const token = await tokenFor(userTech1);

    // .exe proibido
    const exeRes = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
      .set('Authorization', `Bearer ${token}`)
      .field('clientUploadId', randomUUID())
      .attach('attachment', Buffer.from('MZ...'), 'programa.exe');

    assert.equal(exeRes.status, 422);

    // Content mismatch (extensão .png com conteúdo texto puro)
    const mismatchRes = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
      .set('Authorization', `Bearer ${token}`)
      .field('clientUploadId', randomUUID())
      .attach('attachment', Buffer.from('isto não é uma imagem png'), 'fake.png');

    assert.equal(mismatchRes.status, 422);
  });

  // Cenário 7 — Idempotência de upload e de mensagem
  it('Cenário 7: Replay idempotente de upload e mensagem retorna registro idêntico sem duplicações', async () => {
    const token = await tokenFor(userTech1);
    const clientUploadId = randomUUID();
    const fileBytes = Buffer.from('Arquivo de teste de idempotencia');

    // 1º envio de upload
    const up1 = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
      .set('Authorization', `Bearer ${token}`)
      .field('clientUploadId', clientUploadId)
      .attach('attachment', fileBytes, 'idemp.txt');
    assert.equal(up1.status, 201);

    // Replay do mesmo upload
    const up2 = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
      .set('Authorization', `Bearer ${token}`)
      .field('clientUploadId', clientUploadId)
      .attach('attachment', fileBytes, 'idemp.txt');
    assert.equal(up2.status, 201);
    assert.equal(up2.body.data.id, up1.body.data.id);

    // 1º envio de mensagem
    const clientMessageId = randomUUID();
    const msg1 = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: 'Mensagem idempotente',
        clientMessageId,
        stagedAttachmentIds: [up1.body.data.id],
      });
    assert.equal(msg1.status, 201);

    // Replay da mesma mensagem
    const msg2 = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        content: 'Mensagem idempotente',
        clientMessageId,
        stagedAttachmentIds: [up1.body.data.id],
      });
    assert.equal(msg2.status, 201);
    assert.equal(msg2.body.data.id, msg1.body.data.id);
  });

  // Cenário 8 — Scanner Antivírus Fail-Closed
  it('Cenário 8: Scanner indisponível ou arquivo malicioso rejeita upload imediatamente (Fail-Closed)', async () => {
    const token = await tokenFor(userTech1);

    // Scanner indisponível
    mockScanner.isAvailable = async () => false;
    const unavailRes = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
      .set('Authorization', `Bearer ${token}`)
      .field('clientUploadId', randomUUID())
      .attach('attachment', Buffer.from('conteudo'), 'teste.txt');
    assert.equal(unavailRes.status, 503);
    assert.equal(unavailRes.body.error.code, 'CHAT_ATTACHMENT_SCANNER_UNAVAILABLE');

    // Scanner com vírus detectado
    mockScanner.isAvailable = async () => true;
    mockScanner.scanFile = async () => ({ result: 'INFECTED', threatName: 'Eicar-Test-Signature' });
    const infectedRes = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
      .set('Authorization', `Bearer ${token}`)
      .field('clientUploadId', randomUUID())
      .attach('attachment', Buffer.from('virus'), 'virus.txt');
    assert.equal(infectedRes.status, 422);
    assert.equal(infectedRes.body.error.code, 'CHAT_ATTACHMENT_REJECTED');

    // Restaura scanner limpo
    mockScanner.scanFile = async () => ({ result: 'CLEAN' });
  });

  // Cenário 9 — Permissões RBAC e Isolamento Histórico de Downloads
  it('Cenário 9: ADMIN_MASTER e SECRETARY sem participação formal têm download bloqueado (404)', async () => {
    const techToken = await tokenFor(userTech1);
    const adminToken = await tokenFor(userAdmin);
    const secToken = await tokenFor(userSecretary);
    const mgrToken = await tokenFor(userManager);

    // Técnico publica anexo
    const up = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
      .set('Authorization', `Bearer ${techToken}`)
      .field('clientUploadId', randomUUID())
      .attach('attachment', Buffer.from('Anexo privado do chat'), 'privado.txt');

    const msg = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/messages`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({
        content: 'Documento interno',
        clientMessageId: randomUUID(),
        stagedAttachmentIds: [up.body.data.id],
      });

    const attachmentId = msg.body.data.attachments[0].id;
    const messageId = msg.body.data.id;

    // ADMIN_MASTER tenta baixar -> 404 seguro (não vaza existência)
    const adminDownload = await request(app)
      .get(`/api/v1/tasks/${taskId}/chat/messages/${messageId}/attachments/${attachmentId}/download`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(adminDownload.status, 404);

    // SECRETARY tenta baixar -> 404 seguro
    const secDownload = await request(app)
      .get(`/api/v1/tasks/${taskId}/chat/messages/${messageId}/attachments/${attachmentId}/download`)
      .set('Authorization', `Bearer ${secToken}`);
    assert.equal(secDownload.status, 404);

    // Gestor da equipe da tarefa baixa com sucesso (200)
    const mgrDownload = await request(app)
      .get(`/api/v1/tasks/${taskId}/chat/messages/${messageId}/attachments/${attachmentId}/download`)
      .set('Authorization', `Bearer ${mgrToken}`);
    assert.equal(mgrDownload.status, 200);
  });

  // Cenário 10 — Bloqueios do Chat (ADMIN_MAINTENANCE)
  it('Cenário 10: Bloqueio do Chat impede novos uploads/envios mas permite download de anexos já publicados', async () => {
    const token = await tokenFor(userTech1);

    // Publica anexo antes do bloqueio
    const up = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
      .set('Authorization', `Bearer ${token}`)
      .field('clientUploadId', randomUUID())
      .attach('attachment', Buffer.from('Publicado antes do lock'), 'anterior.txt');

    const msg = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientMessageId: randomUUID(),
        stagedAttachmentIds: [up.body.data.id],
      });

    const attachmentId = msg.body.data.attachments[0].id;
    const messageId = msg.body.data.id;

    // Ativa bloqueio na conversa
    const lock = dbData.chatLockStates.find((l) => l.conversationId === conversationId);
    lock.isLocked = true;
    lock.reason = 'ADMIN_MAINTENANCE';

    // Novo upload é bloqueado com 423
    const newUp = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
      .set('Authorization', `Bearer ${token}`)
      .field('clientUploadId', randomUUID())
      .attach('attachment', Buffer.from('bloqueado'), 'novo.txt');
    assert.equal(newUp.status, 423);

    // Novo envio é bloqueado com 423
    const newMsg = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'tentativa', clientMessageId: randomUUID() });
    assert.equal(newMsg.status, 423);

    // Download do anexo publicado anteriormente CONTINUA AUTORIZADO (200)
    const download = await request(app)
      .get(`/api/v1/tasks/${taskId}/chat/messages/${messageId}/attachments/${attachmentId}/download`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(download.status, 200);
  });

  // Cenário 11 — Integridade e arquivo físico ausente no storage
  it('Cenário 11: Arquivo físico ausente no storage falha com erro seguro 404 CHAT_ATTACHMENT_FILE_MISSING', async () => {
    const token = await tokenFor(userTech1);
    const originalBytes = Buffer.from('Arquivo que sera removido do storage');

    const up = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/attachments/staged`)
      .set('Authorization', `Bearer ${token}`)
      .field('clientUploadId', randomUUID())
      .attach('attachment', originalBytes, 'removido.txt');

    const msg = await request(app)
      .post(`/api/v1/tasks/${taskId}/chat/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientMessageId: randomUUID(),
        stagedAttachmentIds: [up.body.data.id],
      });

    const attachment = msg.body.data.attachments[0];
    const attachmentInDb = dbData.chatMessageAttachments.find((a) => a.id === attachment.id);
    const physicalPath = path.join(storageRoot, ...attachmentInDb.storagePath.split('/'));

    // Remove fisicamente o arquivo do storage
    await rm(physicalPath, { force: true });

    const downloadRes = await request(app)
      .get(`/api/v1/tasks/${taskId}/chat/messages/${msg.body.data.id}/attachments/${attachment.id}/download`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(downloadRes.status, 404);
    assert.equal(downloadRes.body.error.code, 'CHAT_ATTACHMENT_FILE_MISSING');
  });
});
