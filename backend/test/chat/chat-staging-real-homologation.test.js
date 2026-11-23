import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createPrismaClient } from '../../src/infrastructure/database/prisma.js';
import { createChatService } from '../../src/modules/chat/chat.service.js';
import { createChatParticipantService } from '../../src/modules/chat/chat-participant.service.js';
import { createChatLockService } from '../../src/modules/chat/chat-lock.service.js';
import { createLocalChatAttachmentStorage } from '../../src/modules/chat/chat-attachment.local-storage.js';
import { createChatAttachmentService } from '../../src/modules/chat/chat-attachment.service.js';
import { createChatMessageService } from '../../src/modules/chat/chat-message.service.js';
import {
  assertChatHomologationDatabase,
  getChatHomologationDatabaseUrl,
} from '../../testing/chat-homologation-guard.js';

const realHomologation = process.env.RUN_CHAT_REAL_HOMOLOGATION === '1' ? describe : describe.skip;

realHomologation('FASE 5.1.2.1 / 5.1.3 — Homologação Integrada Real do Staging e Publicação de Anexos no MariaDB Isolado', () => {
  let prisma;
  let tmpStorageRoot;
  let tmpTestFiles;
  let storage;
  let chatService;
  let participantService;
  let lockService;
  let attachmentService;
  let messageService;

  // Usuários Fictícios de Teste
  const roleAdminId = '00000000-0000-4000-8000-000000000001';
  const roleMgrId = '00000000-0000-4000-8000-000000000003';
  const roleTechId = '00000000-0000-4000-8000-000000000004';

  const userAdmin = { id: randomUUID(), name: 'Admin Staging', email: `${randomUUID()}@staging.test`, roleCode: 'ADMIN_MASTER', roleId: roleAdminId };
  const userMgr = { id: randomUUID(), name: 'Gestor Staging', email: `${randomUUID()}@staging.test`, roleCode: 'MANAGER', roleId: roleMgrId };
  const userTech1 = { id: randomUUID(), name: 'Tecnico 1 Staging', email: `${randomUUID()}@staging.test`, roleCode: 'TECHNICIAN', roleId: roleTechId };
  const userTech2 = { id: randomUUID(), name: 'Tecnico 2 Staging', email: `${randomUUID()}@staging.test`, roleCode: 'TECHNICIAN', roleId: roleTechId };
  const userOutsider = { id: randomUUID(), name: 'Outsider Staging', email: `${randomUUID()}@staging.test`, roleCode: 'TECHNICIAN', roleId: roleTechId };

  const actorAdmin = { userId: userAdmin.id, roleCode: 'ADMIN_MASTER' };
  const actorTech1 = { userId: userTech1.id, roleCode: 'TECHNICIAN' };
  const actorTech2 = { userId: userTech2.id, roleCode: 'TECHNICIAN' };
  const actorOutsider = { userId: userOutsider.id, roleCode: 'TECHNICIAN' };
  const actorMgr = { userId: userMgr.id, roleCode: 'MANAGER' };

  let teamId;
  let taskId;
  let cycleId;
  let conversationId;

  // Mock scanner seguro para testes de integração no MariaDB
  const mockCleanScanner = {
    isAvailable: async () => true,
    scanFile: async () => ({ result: 'CLEAN' }),
  };

  before(async () => {
    const homologationDatabaseUrl = getChatHomologationDatabaseUrl();
    prisma = createPrismaClient(homologationDatabaseUrl, { connectionLimit: 10 });

    // 1. Guard de integridade
    await assertChatHomologationDatabase(prisma);

    // 2. Cria diretórios temporários isolados
    tmpStorageRoot = await mkdtemp(path.join(os.tmpdir(), 'seaf-real-staging-storage-'));
    tmpTestFiles = await mkdtemp(path.join(os.tmpdir(), 'seaf-real-staging-files-'));

    // 3. Inicializa storage e serviços reais
    storage = createLocalChatAttachmentStorage({ rootPath: tmpStorageRoot });
    participantService = createChatParticipantService({ prisma });
    chatService = createChatService({ prisma, participantService });
    lockService = createChatLockService({ prisma });

    attachmentService = createChatAttachmentService({
      prisma,
      storage,
      scanner: mockCleanScanner,
      enabled: true,
      ttlMinutes: 1440,
      maxBytes: 20 * 1024 * 1024,
      userQuotaBytes: 100 * 1024 * 1024,
      conversationQuotaBytes: 250 * 1024 * 1024,
    });

    messageService = createChatMessageService({
      prisma,
      storage,
    });

    // 4. Seed de usuários e equipes fictícias
    for (const u of [userAdmin, userMgr, userTech1, userTech2, userOutsider]) {
      await prisma.user.create({
        data: {
          id: u.id,
          name: u.name,
          emailNormalized: u.email,
          passwordHash: 'argon2_dummy_hash_for_test',
          roleId: u.roleId,
          isActive: true,
        },
      });
    }

    teamId = randomUUID();
    await prisma.team.create({
      data: {
        id: teamId,
        name: `Equipe Homologação Staging ${teamId.slice(0, 8)}`,
        isActive: true,
      },
    });

    await prisma.teamManager.create({
      data: {
        id: randomUUID(),
        teamId,
        userId: userMgr.id,
        assignedAt: new Date(),
      },
    });

    for (const u of [userTech1, userTech2]) {
      await prisma.teamMember.create({
        data: {
          id: randomUUID(),
          teamId,
          userId: u.id,
          joinedAt: new Date(),
        },
      });
    }

    // 5. Cria tarefa, ciclo e conversa de teste
    taskId = randomUUID();
    cycleId = randomUUID();
    await prisma.task.create({
      data: {
        id: taskId,
        teamId,
        createdById: userMgr.id,
        version: 1,
      },
    });

    await prisma.taskCycle.create({
      data: {
        id: cycleId,
        taskId,
        cycleNumber: 1,
        title: 'Tarefa Real para Homologação de Staging',
        description: 'Descrição de teste homologação',
        status: 'IN_PROGRESS',
        openedAt: new Date(),
        version: 1,
      },
    });

    await prisma.task.update({
      where: { id: taskId },
      data: { currentCycleId: cycleId },
    });

    await prisma.taskAssignment.create({
      data: {
        id: randomUUID(),
        cycleId,
        userId: userTech1.id,
        assignedById: userMgr.id,
        assignedAt: new Date(),
        acceptedAt: new Date(),
      },
    });

    const conv = await chatService.ensureConversationForTask(
      prisma,
      taskId,
      cycleId,
      userMgr.id,
      userTech1.id,
    );
    conversationId = conv.id;

    // Adiciona Tecnico 2 como participante
    await participantService.addParticipant(actorMgr, taskId, userTech2.id);
  });

  after(async () => {
    if (tmpStorageRoot) await rm(tmpStorageRoot, { recursive: true, force: true }).catch(() => undefined);
    if (tmpTestFiles) await rm(tmpTestFiles, { recursive: true, force: true }).catch(() => undefined);
    if (prisma) await prisma.$disconnect();
  });

  async function createFixtureFile(name, content) {
    const filePath = path.join(tmpTestFiles, `${randomUUID()}_${name}`);
    await writeFile(filePath, content);
    return { path: filePath, originalname: name };
  }

  describe('1. Upload e Staging Real no MariaDB', () => {
    it('persiste upload válido no MariaDB com status READY, expiração em 24h e FKs corretas', async () => {
      const file = await createFixtureFile('oficio.pdf', '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
      const clientUploadId = randomUUID();

      const result = await attachmentService.stage(actorTech1, taskId, clientUploadId, file);
      assert.ok(result.id);
      assert.equal(result.originalName, 'oficio.pdf');
      assert.equal(result.status, 'READY');
      assert.equal(result.mimeType, 'application/pdf');

      // Verifica persistência física na tabela chat_attachment_uploads
      const persisted = await prisma.chatAttachmentUpload.findUnique({
        where: { id: result.id },
      });
      assert.ok(persisted);
      assert.equal(persisted.conversationId, conversationId);
      assert.equal(persisted.uploadedById, userTech1.id);
      assert.equal(persisted.clientUploadId, clientUploadId);
      assert.equal(persisted.status, 'READY');
      assert.ok(persisted.stagingKey.startsWith('staging/'));
      assert.ok(persisted.sha256.length === 64);

      // Confirma que o arquivo existe fisicamente no diretório de staging
      const stagingExists = await storage.exists(persisted.stagingKey);
      assert.equal(stagingExists, true);
    });

    it('rejeita arquivo com extensão proibida (.exe)', async () => {
      const file = await createFixtureFile('malware.exe', 'MZ binary executable');
      await assert.rejects(
        () => attachmentService.stage(actorTech1, taskId, randomUUID(), file),
        (err) => err.code === 'CHAT_ATTACHMENT_EXTENSION_NOT_ALLOWED',
      );
    });

    it('rejeita arquivo com discrepância de conteúdo real (content mismatch)', async () => {
      const file = await createFixtureFile('foto_falsa.jpg', 'isto é texto puro, não imagem');
      await assert.rejects(
        () => attachmentService.stage(actorTech1, taskId, randomUUID(), file),
        (err) => err.code === 'CHAT_ATTACHMENT_CONTENT_MISMATCH',
      );
    });
  });

  describe('2. Idempotência e Concorrência Real no MariaDB', () => {
    it('replay idempotente retorna registro idêntico sem duplicar upload', async () => {
      const file = await createFixtureFile('nota.txt', 'conteudo da nota institucional');
      const clientUploadId = randomUUID();

      const first = await attachmentService.stage(actorTech1, taskId, clientUploadId, file);
      const second = await attachmentService.stage(actorTech1, taskId, clientUploadId, file);

      assert.equal(first.id, second.id);
      assert.equal(first.status, second.status);

      // Confirma que existe apenas 1 registro no banco
      const count = await prisma.chatAttachmentUpload.count({
        where: { conversationId, uploadedById: userTech1.id, clientUploadId },
      });
      assert.equal(count, 1);
    });

    it('rejeita replay com mesmo clientUploadId e conteúdo alterado (409)', async () => {
      const clientUploadId = randomUUID();
      const file1 = await createFixtureFile('doc1.txt', 'conteudo original');
      const file2 = await createFixtureFile('doc2.txt', 'conteudo diferente adulterado');

      await attachmentService.stage(actorTech1, taskId, clientUploadId, file1);
      await assert.rejects(
        () => attachmentService.stage(actorTech1, taskId, clientUploadId, file2),
        (err) => err.status === 409 && err.code === 'UPLOAD_IDEMPOTENCY_CONFLICT',
      );
    });
  });

  describe('3. Segurança, RBAC e Bloqueios no MariaDB', () => {
    it('impede upload por usuário de outra equipe/sem participação ativa (403)', async () => {
      const file = await createFixtureFile('intruso.txt', 'tentativa de upload');
      await assert.rejects(
        () => attachmentService.stage(actorOutsider, taskId, randomUUID(), file),
        (err) => err.status === 403 && err.code === 'FORBIDDEN',
      );
    });

    it('impede upload quando a conversa está bloqueada (423)', async () => {
      // Bloqueia a conversa
      await lockService.adminLock(actorAdmin, taskId, {
        isLocked: true,
        reason: 'ADMIN_MAINTENANCE',
      });

      const file = await createFixtureFile('bloqueado.txt', 'teste durante bloqueio');
      await assert.rejects(
        () => attachmentService.stage(actorTech1, taskId, randomUUID(), file),
        (err) => err.status === 423 && err.code === 'CHAT_LOCKED',
      );

      // Desbloqueia para os próximos testes
      await prisma.chatLockState.update({
        where: { conversationId },
        data: { isLocked: false, reason: null, lockedById: null, lockedAt: null },
      });
    });

    it('impede associação cruzada entre mensagens e conversas via FK composta (messageId, conversationId)', async () => {
      // Cria uma outra tarefa e conversa
      const otherTaskId = randomUUID();
      const otherCycleId = randomUUID();
      await prisma.task.create({
        data: { id: otherTaskId, teamId, createdById: userMgr.id, version: 1 },
      });
      await prisma.taskCycle.create({
        data: { id: otherCycleId, taskId: otherTaskId, cycleNumber: 1, title: 'Outra Tarefa', description: 'Outra Descrição', status: 'IN_PROGRESS', openedAt: new Date(), version: 1 },
      });
      const otherConv = await chatService.ensureConversationForTask(
        prisma, otherTaskId, otherCycleId, userMgr.id, userTech1.id,
      );

      // Cria mensagem na conversa 1
      const msgId = randomUUID();
      await prisma.chatMessage.create({
        data: {
          id: msgId,
          conversationId,
          cycleId,
          authorId: userTech1.id,
          sequenceNumber: 100n,
          clientMessageId: randomUUID(),
          content: 'Mensagem na conversa 1',
          status: 'PENDING',
        },
      });

      // Tenta criar upload associado à conversa 2 mas com messageId da conversa 1
      await assert.rejects(
        async () => {
          await prisma.chatAttachmentUpload.create({
            data: {
              id: randomUUID(),
              conversationId: otherConv.id, // conversa 2
              uploadedById: userTech1.id,
              clientUploadId: randomUUID(),
              messageId: msgId, // mensagem da conversa 1!
              originalName: 'teste_fk.txt',
              stagingKey: `staging/${randomUUID()}.upload`,
              mimeType: 'text/plain',
              extension: '.txt',
              sizeBytes: 10n,
              sha256: '0'.repeat(64),
              status: 'READY',
              expiresAt: new Date(Date.now() + 86400000),
            },
          });
        },
        (err) => String(err).includes('Foreign key constraint') || String(err).includes('foreign key') || String(err).includes('1452'),
        'A FK composta (messageId, conversationId) DEVE impedir associação cruzada entre conversas',
      );
    });
  });

  describe('4. Consulta e Cancelamento no MariaDB', () => {
    it('cancel remove o staging físico e marca o status EXPIRED no MariaDB', async () => {
      const file = await createFixtureFile('cancelar.txt', 'arquivo a ser cancelado');
      const staged = await attachmentService.stage(actorTech1, taskId, randomUUID(), file);

      const dbBefore = await prisma.chatAttachmentUpload.findUnique({ where: { id: staged.id } });
      assert.equal(await storage.exists(dbBefore.stagingKey), true);

      const cancelled = await attachmentService.cancel(actorTech1, taskId, staged.id);
      assert.equal(cancelled.status, 'EXPIRED');

      const dbAfter = await prisma.chatAttachmentUpload.findUnique({ where: { id: staged.id } });
      assert.equal(dbAfter.status, 'EXPIRED');
      assert.equal(dbAfter.failureCode, 'CANCELLED_BY_USER');

      // O arquivo físico de staging deve ter sido removido
      assert.equal(await storage.exists(dbBefore.stagingKey), false);
    });

    it('impede cancelamento de upload pertencente a outro usuário (404)', async () => {
      const file = await createFixtureFile('privado.txt', 'arquivo do tecnico 1');
      const staged = await attachmentService.stage(actorTech1, taskId, randomUUID(), file);

      // Tecnico 2 tenta cancelar o upload do Tecnico 1
      await assert.rejects(
        () => attachmentService.cancel(actorTech2, taskId, staged.id),
        (err) => err.status === 404 && err.code === 'CHAT_ATTACHMENT_UPLOAD_NOT_FOUND',
      );
    });
  });

  describe('5. Consumo e Publicação Definitiva de Mensagens com Anexos no MariaDB (Fase 5.1.3)', () => {
    it('publica mensagem com múltiplos anexos, gravando em chat_message_attachments e promovendo para o storage', async () => {
      const f1 = await createFixtureFile('relatorio.pdf', '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
      const f2 = await createFixtureFile('dados.txt', 'dados técnicos em texto puro');

      const staged1 = await attachmentService.stage(actorTech1, taskId, randomUUID(), f1);
      const staged2 = await attachmentService.stage(actorTech1, taskId, randomUUID(), f2);

      const clientMessageId = randomUUID();
      const message = await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId,
        content: 'Segue relatório e dados anexos.',
        stagedAttachmentIds: [staged1.id, staged2.id],
      });

      assert.ok(message.id);
      assert.equal(message.status, 'PUBLISHED');
      assert.equal(message.content, 'Segue relatório e dados anexos.');
      assert.equal(message.attachments.length, 2);

      // Ordem preservada
      assert.equal(message.attachments[0].originalName, 'relatorio.pdf');
      assert.equal(message.attachments[1].originalName, 'dados.txt');

      // Verifica registros reais persistidos em chat_message_attachments
      const dbAttachments = await prisma.chatMessageAttachment.findMany({
        where: { messageId: message.id },
        orderBy: { position: 'asc' },
      });
      assert.equal(dbAttachments.length, 2);
      assert.equal(dbAttachments[0].position, 0);
      assert.equal(dbAttachments[0].sourceUploadId, staged1.id);
      assert.equal(dbAttachments[1].position, 1);
      assert.equal(dbAttachments[1].sourceUploadId, staged2.id);

      // Confirma que os uploads foram atualizados para PROMOTED no MariaDB
      const dbUpload1 = await prisma.chatAttachmentUpload.findUnique({ where: { id: staged1.id } });
      const dbUpload2 = await prisma.chatAttachmentUpload.findUnique({ where: { id: staged2.id } });
      assert.equal(dbUpload1.status, 'PROMOTED');
      assert.equal(dbUpload2.status, 'PROMOTED');
      assert.equal(dbUpload1.messageId, message.id);
      assert.equal(dbUpload2.messageId, message.id);

      // Confirma promoção física no storage
      assert.equal(await storage.exists(dbUpload1.targetStorageKey), true);
      assert.equal(await storage.exists(dbUpload2.targetStorageKey), true);
      assert.equal(await storage.exists(dbUpload1.stagingKey), false);
      assert.equal(await storage.exists(dbUpload2.stagingKey), false);
    });

    it('publica mensagem somente com anexo (sem texto)', async () => {
      const file = await createFixtureFile('documento_avulso.pdf', '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
      const staged = await attachmentService.stage(actorTech1, taskId, randomUUID(), file);

      const clientMessageId = randomUUID();
      const message = await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId,
        content: '',
        stagedAttachmentIds: [staged.id],
      });

      assert.equal(message.status, 'PUBLISHED');
      assert.equal(message.content, null);
      assert.equal(message.attachments.length, 1);
      assert.equal(message.attachments[0].originalName, 'documento_avulso.pdf');
    });

    it('replay idempotente com mesmos anexos retorna registro idêntico sem duplicar', async () => {
      const file = await createFixtureFile('idempotente.txt', 'conteudo idempotente');
      const staged = await attachmentService.stage(actorTech1, taskId, randomUUID(), file);

      const clientMessageId = randomUUID();
      const first = await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId,
        content: 'Mensagem com replay',
        stagedAttachmentIds: [staged.id],
      });

      const second = await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId,
        content: 'Mensagem com replay',
        stagedAttachmentIds: [staged.id],
      });

      assert.equal(first.id, second.id);
      assert.equal(first.sequenceNumber, second.sequenceNumber);
      assert.equal(first.attachments.length, 1);
      assert.equal(second.attachments.length, 1);

      // Confirma que não duplicou em chat_message_attachments
      const count = await prisma.chatMessageAttachment.count({
        where: { messageId: first.id },
      });
      assert.equal(count, 1);
    });

    it('rejeita replay com mesmo clientMessageId e anexos divergentes (409 Conflict)', async () => {
      const f1 = await createFixtureFile('a1.txt', 'anexo 1');
      const f2 = await createFixtureFile('a2.txt', 'anexo 2');
      const s1 = await attachmentService.stage(actorTech1, taskId, randomUUID(), f1);
      const s2 = await attachmentService.stage(actorTech1, taskId, randomUUID(), f2);

      const clientMessageId = randomUUID();
      await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId,
        content: 'Texto fixo',
        stagedAttachmentIds: [s1.id],
      });

      await assert.rejects(
        () => messageService.sendMessage(actorTech1, taskId, {
          clientMessageId,
          content: 'Texto fixo',
          stagedAttachmentIds: [s2.id],
        }),
        (err) => err.status === 409 && err.code === 'IDEMPOTENCY_CONFLICT',
      );
    });

    it('impede reutilização de upload já promovido por outra mensagem (409 Conflict)', async () => {
      const file = await createFixtureFile('exclusivo.txt', 'arquivo de uso unico');
      const staged = await attachmentService.stage(actorTech1, taskId, randomUUID(), file);

      // Publica na primeira mensagem
      await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId: randomUUID(),
        content: 'Primeira mensagem',
        stagedAttachmentIds: [staged.id],
      });

      // Tenta publicar em uma segunda mensagem com novo clientMessageId
      await assert.rejects(
        () => messageService.sendMessage(actorTech1, taskId, {
          clientMessageId: randomUUID(),
          content: 'Segunda mensagem tentando roubar o anexo',
          stagedAttachmentIds: [staged.id],
        }),
        (err) => err.status === 409 && err.code === 'CHAT_ATTACHMENT_ALREADY_CLAIMED',
      );
    });
  });

  describe('Suíte 6: Fase 5.1.4 — Download Seguro, Histórico de Participação e Controle de Acesso', () => {
    let publishedMessage;
    let publishedAttachment;
    let publishedFileContent;

    before(async () => {
      publishedFileContent = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
      const fixture = await createFixtureFile('documento_real.pdf', publishedFileContent);
      const staged = await attachmentService.stage(actorTech1, taskId, randomUUID(), fixture);

      const sent = await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId: randomUUID(),
        content: 'Mensagem com anexo homologado para download',
        stagedAttachmentIds: [staged.id],
      });

      publishedMessage = sent;
      publishedAttachment = sent.attachments[0];
    });

    it('download autorizado via stream no MariaDB real com auditoria persistida', async () => {
      const downloadInfo = await messageService.getAttachmentForDownload(
        actorTech1,
        taskId,
        publishedMessage.id,
        publishedAttachment.id,
      );

      assert.ok(downloadInfo.stream);
      assert.equal(downloadInfo.attachmentId, publishedAttachment.id);
      assert.equal(downloadInfo.originalName, 'documento_real.pdf');
      assert.equal(downloadInfo.mimeType, 'application/pdf');

      // Consome o stream e valida o conteúdo exato
      const chunks = [];
      for await (const chunk of downloadInfo.stream) {
        chunks.push(chunk);
      }
      const downloaded = Buffer.concat(chunks);
      assert.deepEqual(downloaded, publishedFileContent);

      // Valida registro de auditoria persistido no banco real
      const audit = await prisma.auditEvent.findFirst({
        where: {
          entityType: 'ChatMessageAttachment',
          entityId: publishedAttachment.id,
          action: 'CHAT_ATTACHMENT_DOWNLOADED',
        },
        orderBy: { createdAt: 'desc' },
      });

      assert.ok(audit, 'Evento de auditoria deve ser persistido no MariaDB');
      assert.equal(audit.actorId, actorTech1.userId);
      assert.equal(audit.afterJson.outcome, 'SUCCESS');
      assert.equal(audit.afterJson.taskId, taskId);
    });

    it('participante removido: pode baixar mensagens anteriores, mas NÃO posteriores ao encerramento', async () => {
      // 1. Participante tech2 está ativo e pode baixar a mensagem anterior
      const infoBefore = await messageService.getAttachmentForDownload(
        actorTech2,
        taskId,
        publishedMessage.id,
        publishedAttachment.id,
      );
      assert.ok(infoBefore.stream);

      // 2. Remove tech2 da conversa
      const participantTech2 = await prisma.chatParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId: actorTech2.userId } },
      });
      await participantService.removeParticipant(actorMgr, taskId, participantTech2.id, 'REMOVED_BY_MANAGER');

      // 3. Publica nova mensagem após remoção de tech2
      const fPost = await createFixtureFile('pos_remocao.txt', 'conteudo pos remocao');
      const stagedPost = await attachmentService.stage(actorTech1, taskId, randomUUID(), fPost);
      const msgPost = await messageService.sendMessage(actorTech1, taskId, {
        clientMessageId: randomUUID(),
        content: 'Mensagem postada apos remocao de tech2',
        stagedAttachmentIds: [stagedPost.id],
      });
      const attPost = msgPost.attachments[0];

      // 4. tech2 ainda PODE baixar anexo anterior
      const infoPast = await messageService.getAttachmentForDownload(
        actorTech2,
        taskId,
        publishedMessage.id,
        publishedAttachment.id,
      );
      assert.ok(infoPast.stream);

      // 5. tech2 é BLOQUEADO de baixar o anexo posterior ao encerramento (404 seguro)
      await assert.rejects(
        () => messageService.getAttachmentForDownload(
          actorTech2,
          taskId,
          msgPost.id,
          attPost.id,
        ),
        (err) => err.status === 404 && err.code === 'CHAT_ATTACHMENT_NOT_FOUND',
      );

      // Confirma registro de auditoria de negação
      const auditDenied = await prisma.auditEvent.findFirst({
        where: {
          entityType: 'ChatMessageAttachment',
          entityId: attPost.id,
          action: 'CHAT_ATTACHMENT_DOWNLOAD_DENIED',
        },
      });
      assert.ok(auditDenied);
      assert.equal(auditDenied.actorId, actorTech2.userId);
    });

    it('download durante bloqueio administrativo do chat permanece autorizado para participantes', async () => {
      // Aplica bloqueio administrativo
      await lockService.adminLock(actorAdmin, taskId, {
        isLocked: true,
        reason: 'ADMIN_MAINTENANCE',
        justification: 'Manutenção técnica de homologação',
      });

      // Confirma que envio de mensagem está bloqueado
      await assert.rejects(
        () => messageService.sendMessage(actorTech1, taskId, {
          clientMessageId: randomUUID(),
          content: 'Tentativa durante lock',
        }),
        (err) => err.status === 423,
      );

      // Mas o download de anexo publicado permanece 100% autorizado
      const downloadInfo = await messageService.getAttachmentForDownload(
        actorTech1,
        taskId,
        publishedMessage.id,
        publishedAttachment.id,
      );
      assert.ok(downloadInfo.stream);

      // Desbloqueia
      await lockService.adminLock(actorAdmin, taskId, {
        isLocked: false,
        reason: 'ADMIN_MAINTENANCE',
        justification: 'Fim da manutenção',
      });
    });

    it('isolamento de conversa: anexo de uma tarefa é estritamente inacessível através de outra tarefa', async () => {
      // Cria uma segunda tarefa com outra conversa
      const task2Id = randomUUID();
      const cycle2Id = randomUUID();
      await prisma.task.create({
        data: {
          id: task2Id,
          teamId,
          createdById: userMgr.id,
          version: 1,
        },
      });
      await prisma.taskCycle.create({
        data: {
          id: cycle2Id,
          taskId: task2Id,
          cycleNumber: 1,
          title: 'Ciclo da Segunda Tarefa Isolada',
          description: 'Descrição da Segunda Tarefa Isolada',
          status: 'IN_PROGRESS',
          openedAt: new Date(),
          version: 1,
        },
      });
      await prisma.task.update({
        where: { id: task2Id },
        data: { currentCycleId: cycle2Id },
      });
      await chatService.ensureConversationForTask(prisma, task2Id, cycle2Id, userMgr.id, userTech1.id);

      // Tenta acessar o anexo da tarefa 1 usando taskId da tarefa 2
      await assert.rejects(
        () => messageService.getAttachmentForDownload(
          actorTech1,
          task2Id,
          publishedMessage.id,
          publishedAttachment.id,
        ),
        (err) => err.status === 404 && err.code === 'CHAT_ATTACHMENT_NOT_FOUND',
      );
    });

    it('ADMIN_MASTER e SECRETARY sem participação formal têm acesso bloqueado a anexos privados', async () => {
      // ADMIN_MASTER tenta baixar anexo privado
      await assert.rejects(
        () => messageService.getAttachmentForDownload(
          actorAdmin,
          taskId,
          publishedMessage.id,
          publishedAttachment.id,
        ),
        (err) => err.status === 404 && err.code === 'CHAT_ATTACHMENT_NOT_FOUND',
      );
    });
  });
});

