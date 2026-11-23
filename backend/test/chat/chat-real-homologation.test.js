import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '../../src/infrastructure/database/prisma.js';
import { createChatService } from '../../src/modules/chat/chat.service.js';
import { createChatParticipantService } from '../../src/modules/chat/chat-participant.service.js';
import { createChatMessageService } from '../../src/modules/chat/chat-message.service.js';
import { createChatLockService } from '../../src/modules/chat/chat-lock.service.js';
import { AppError } from '../../src/shared/errors/app-error.js';
import {
  assertChatHomologationDatabase,
  getChatHomologationDatabaseUrl,
} from '../../testing/chat-homologation-guard.js';

const realHomologation = process.env.RUN_CHAT_REAL_HOMOLOGATION === '1' ? describe : describe.skip;

realHomologation('FASE 4.6 — Homologação Integrada Real do Chat no MariaDB Isolado', () => {
  let prisma;
  let concurrentPrisma;

  // Entidades Fictícias de Homologação
  const roleAdminId = '00000000-0000-4000-8000-000000000001';
  const roleSecId = '00000000-0000-4000-8000-000000000002';
  const roleMgrId = '00000000-0000-4000-8000-000000000003';
  const roleTechId = '00000000-0000-4000-8000-000000000004';

  const userAdmin = { id: randomUUID(), name: 'Admin Homolog', email: `${randomUUID()}@homolog.test`, roleCode: 'ADMIN_MASTER', roleId: roleAdminId };
  const userSec = { id: randomUUID(), name: 'Sec Homolog', email: `${randomUUID()}@homolog.test`, roleCode: 'SECRETARY', roleId: roleSecId };
  const userMgr = { id: randomUUID(), name: 'Mgr Homolog', email: `${randomUUID()}@homolog.test`, roleCode: 'MANAGER', roleId: roleMgrId };
  const userMgrOther = { id: randomUUID(), name: 'Mgr Other Homolog', email: `${randomUUID()}@homolog.test`, roleCode: 'MANAGER', roleId: roleMgrId };
  const userTech1 = { id: randomUUID(), name: 'Tech 1 Homolog', email: `${randomUUID()}@homolog.test`, roleCode: 'TECHNICIAN', roleId: roleTechId };
  const userTech2 = { id: randomUUID(), name: 'Tech 2 Homolog', email: `${randomUUID()}@homolog.test`, roleCode: 'TECHNICIAN', roleId: roleTechId };
  const userTech3 = { id: randomUUID(), name: 'Tech 3 Homolog', email: `${randomUUID()}@homolog.test`, roleCode: 'TECHNICIAN', roleId: roleTechId };
  const userMgr2 = { id: randomUUID(), name: 'Manager 2 Homolog', email: `${randomUUID()}@homolog.test`, roleCode: 'MANAGER', roleId: roleMgrId };

  const actorAdmin = { userId: userAdmin.id, roleCode: 'ADMIN_MASTER' };
  const actorSec = { userId: userSec.id, roleCode: 'SECRETARY' };
  const actorMgr = { userId: userMgr.id, roleCode: 'MANAGER' };
  const actorMgr2 = { userId: userMgr2.id, roleCode: 'MANAGER' };
  const actorMgrOther = { userId: userMgrOther.id, roleCode: 'MANAGER' };
  const actorTech1 = { userId: userTech1.id, roleCode: 'TECHNICIAN' };
  const actorTech2 = { userId: userTech2.id, roleCode: 'TECHNICIAN' };
  const actorTech3 = { userId: userTech3.id, roleCode: 'TECHNICIAN' };

  let teamHomologId;
  let teamOtherId;

  // Serviços Reais instanciados com o Prisma de homologação
  let chatService;
  let participantService;
  let messageService;
  let lockService;
  // Helper para provisionar tarefa e conversa isolada para cada cenário
  async function setupTestTask({ taskId = randomUUID(), cycleId = randomUUID(), title = 'Tarefa Homolog' } = {}) {
    await prisma.task.create({
      data: {
        id: taskId,
        teamId: teamHomologId,
        createdById: userMgr.id,
        version: 1,
      },
    });

    await prisma.taskCycle.create({
      data: {
        id: cycleId,
        taskId: taskId,
        cycleNumber: 1,
        title,
        description: 'Descrição de teste homologação',
        status: 'PENDING',
        openedAt: new Date(),
        version: 1,
      },
    });

    await prisma.task.update({
      where: { id: taskId },
      data: { currentCycleId: cycleId },
    });

    const assignmentId = randomUUID();
    await prisma.taskAssignment.create({
      data: {
        id: assignmentId,
        cycleId,
        userId: userTech1.id,
        assignedById: userMgr.id,
        assignedAt: new Date(),
      },
    });

    const conversation = await chatService.ensureConversationForTask(
      prisma,
      taskId,
      cycleId,
      userMgr.id,
      userTech1.id
    );

    return { taskId, cycleId, assignmentId, conversation };
  }

  before(async () => {
    const homologationDatabaseUrl = getChatHomologationDatabaseUrl();
    prisma = createPrismaClient(homologationDatabaseUrl, { connectionLimit: 10 });
    concurrentPrisma = createPrismaClient(homologationDatabaseUrl, { connectionLimit: 10 });

    // 1. Confirmação programática do destino e da negação de acesso ao banco operacional.
    await assertChatHomologationDatabase(prisma);

    // 2. Seed de usuários fictícios (cada execução usa IDs únicos)
    for (const u of [userAdmin, userSec, userMgr, userMgr2, userMgrOther, userTech1, userTech2, userTech3]) {
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

    // 3. Seed de equipes fictícias
    teamHomologId = randomUUID();
    await prisma.team.create({
      data: {
        id: teamHomologId,
        name: 'Equipe de Homologação Chat',
      },
    });
    await prisma.teamManager.create({
      data: {
        id: randomUUID(),
        teamId: teamHomologId,
        userId: userMgr.id,
        assignedAt: new Date(),
      },
    });
    await prisma.teamManager.create({
      data: {
        id: randomUUID(),
        teamId: teamHomologId,
        userId: userMgr2.id,
        assignedAt: new Date(),
      },
    });

    teamOtherId = randomUUID();
    await prisma.team.create({
      data: {
        id: teamOtherId,
        name: 'Equipe Secundária',
      },
    });
    await prisma.teamManager.create({
      data: {
        id: randomUUID(),
        teamId: teamOtherId,
        userId: userMgrOther.id,
        assignedAt: new Date(),
      },
    });

    // 4. Instanciar serviços reais conectados ao banco isolado
    participantService = createChatParticipantService({ prisma });
    chatService = createChatService({ prisma, participantService });
    messageService = createChatMessageService({ prisma });
    lockService = createChatLockService({ prisma });
  });

  after(async () => {
    if (prisma) await prisma.$disconnect();
    if (concurrentPrisma) await concurrentPrisma.$disconnect();
  });

  describe('3. Testes de Integração Real (Prisma + MariaDB 10.11)', () => {
    it('3.1 Criação de tarefa com conversa automática e inclusão formal do criador e responsável', async () => {
      const { taskId, cycleId, conversation } = await setupTestTask({ title: 'Tarefa 3.1' });

      assert.ok(conversation.id);
      assert.equal(conversation.taskId, taskId);

      // Verificação direta no banco MariaDB
      const [dbConv] = await prisma.$queryRawUnsafe('SELECT * FROM chat_conversations WHERE id = ?', conversation.id);
      assert.ok(dbConv);
      assert.equal(dbConv.taskId, taskId);

      const [dbLock] = await prisma.$queryRawUnsafe('SELECT * FROM chat_lock_states WHERE conversationId = ?', conversation.id);
      assert.ok(dbLock);
      assert.equal(Boolean(dbLock.isLocked), false);
      assert.equal(dbLock.cycleId, cycleId);

      const dbParts = await prisma.$queryRawUnsafe('SELECT * FROM chat_participants WHERE conversationId = ?', conversation.id);
      assert.equal(dbParts.length, 2);

      const dbPeriods = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_participation_periods WHERE participantId IN (?, ?)',
        dbParts[0].id,
        dbParts[1].id
      );
      assert.equal(dbPeriods.length, 2);
      assert.ok(dbPeriods.every((p) => p.endedAt === null));
    });

    it('3.2 Reatribuição no banco real preserva responsável anterior como participante ativo', async () => {
      const { taskId, cycleId } = await setupTestTask({ title: 'Tarefa 3.2' });

      // Reatribui para userTech2: (client, taskId, cycleId, actorId, newAssigneeId)
      await chatService.handleTaskReassignment(
        prisma,
        taskId,
        cycleId,
        userMgr.id,
        userTech2.id
      );

      // Consulta participantes no banco MariaDB
      const participants = await prisma.$queryRawUnsafe(
        'SELECT p.id, p.userId, count(per.id) as period_count FROM chat_participants p ' +
        'JOIN chat_participation_periods per ON per.participantId = p.id AND per.endedAt IS NULL ' +
        'WHERE p.conversationId = (SELECT id FROM chat_conversations WHERE taskId = ?) ' +
        'GROUP BY p.id, p.userId',
        taskId
      );

      assert.equal(participants.length, 3, 'Criador, Técnico 1 e Técnico 2 devem estar ativos');
      assert.ok(participants.some((p) => p.userId === userTech1.id), 'Técnico anterior DEVE continuar ativo');
      assert.ok(participants.some((p) => p.userId === userTech2.id), 'Novo técnico DEVE estar ativo');
      assert.ok(participants.some((p) => p.userId === userMgr.id), 'Criador DEVE continuar ativo');
    });

    it('3.3 Remoção e reinclusão explícita geram múltiplos períodos históricos sem sobreposição', async () => {
      const { taskId } = await setupTestTask({ title: 'Tarefa 3.3' });

      const p1 = await prisma.chatParticipant.findFirst({
        where: { userId: userTech1.id, conversation: { taskId } },
      });

      // 1. Remove userTech1
      await participantService.removeParticipant(actorMgr, taskId, p1.id, 'REMOVED_BY_MANAGER');

      // Verifica no banco que o período foi encerrado
      const [closedPeriod] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_participation_periods WHERE participantId = ? AND endedAt IS NOT NULL',
        p1.id
      );
      assert.ok(closedPeriod);
      assert.equal(closedPeriod.endReason, 'REMOVED_BY_MANAGER');

      // 2. Re-adiciona userTech1
      await participantService.addParticipant(actorMgr, taskId, userTech1.id);

      // Verifica que agora possui 2 períodos: 1 encerrado e 1 ativo ordenados por joinedAt
      const allPeriods = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_participation_periods WHERE participantId = ? ORDER BY joinedAt ASC',
        p1.id
      );
      assert.equal(allPeriods.length, 2);
      assert.ok(allPeriods[0].endedAt !== null);
      assert.ok(allPeriods[1].endedAt === null);
      assert.ok(new Date(allPeriods[1].joinedAt).getTime() >= new Date(allPeriods[0].endedAt).getTime());
    });

    it('3.4 Envio de mensagens, numeração sequencial monotônica e persistência real no MariaDB', async () => {
      const { taskId, cycleId } = await setupTestTask({ title: 'Tarefa 3.4' });

      // Adiciona Tech2 também
      await participantService.addParticipant(actorMgr, taskId, userTech2.id);

      const msg1 = await messageService.sendMessage(actorTech1, taskId, {
        content: 'Primeira mensagem real de teste de homologação',
        clientMessageId: '660e8400-e29b-41d4-a716-446655440001',
      });

      const msg2 = await messageService.sendMessage(actorTech2, taskId, {
        content: 'Segunda mensagem real de resposta',
        clientMessageId: '660e8400-e29b-41d4-a716-446655440002',
      });

      assert.equal(String(msg1.sequenceNumber), '1');
      assert.equal(String(msg2.sequenceNumber), '2');

      // Verificação direta no banco MariaDB
      const [dbMsg1] = await prisma.$queryRawUnsafe('SELECT * FROM chat_messages WHERE id = ?', msg1.id);
      const [dbMsg2] = await prisma.$queryRawUnsafe('SELECT * FROM chat_messages WHERE id = ?', msg2.id);

      assert.equal(dbMsg1.sequenceNumber, 1n);
      assert.equal(dbMsg2.sequenceNumber, 2n);
      assert.equal(dbMsg1.cycleId, cycleId);
      assert.equal(dbMsg1.status, 'PUBLISHED');
    });

    it('3.5 Idempotência estrita por clientMessageId no banco real', async () => {
      const { taskId } = await setupTestTask({ title: 'Tarefa 3.5' });
      const testClientMessageId = randomUUID();

      const msg1 = await messageService.sendMessage(actorTech1, taskId, {
        content: 'Mensagem para testar idempotência',
        clientMessageId: testClientMessageId,
      });

      // Reenvio com o mesmo clientMessageId
      const duplicateRes = await messageService.sendMessage(actorTech1, taskId, {
        content: 'Mensagem para testar idempotência',
        clientMessageId: testClientMessageId,
      });

      assert.equal(duplicateRes.id, msg1.id);
      assert.equal(String(duplicateRes.sequenceNumber), '1');

      const count = await prisma.$queryRawUnsafe(
        'SELECT count(*) as count FROM chat_messages WHERE conversationId = (SELECT id FROM chat_conversations WHERE taskId = ?) AND clientMessageId = ?',
        taskId,
        testClientMessageId
      );
      assert.equal(Number(count[0].count), 1);
    });

    it('3.6 Paginação e pesquisa textual no banco MariaDB real', async () => {
      const { taskId } = await setupTestTask({ title: 'Tarefa 3.6' });

      await messageService.sendMessage(actorTech1, taskId, {
        content: 'Relatório financeiro preliminar',
        clientMessageId: randomUUID(),
      });
      await messageService.sendMessage(actorTech1, taskId, {
        content: 'Outro assunto qualquer sem palavras-chave',
        clientMessageId: randomUUID(),
      });

      const history = await messageService.listMessages(actorTech1, taskId, { limit: 10 });
      assert.equal(history.items.length, 2);
      assert.equal(history.pagination.totalCount, 2);

      const search = await messageService.listMessages(actorTech1, taskId, { q: 'financeiro' });
      assert.equal(search.items.length, 1);
      assert.equal(String(search.items[0].sequenceNumber), '1');
    });

    it('3.7 Atualização de cursores de leitura reais (chat_read_receipts e chat_functional_read_states)', async () => {
      const { taskId } = await setupTestTask({ title: 'Tarefa 3.7' });

      const msg = await messageService.sendMessage(actorTech1, taskId, {
        content: 'Mensagem para leitura',
        clientMessageId: randomUUID(),
      });

      // Técnico avança cursor
      await messageService.advanceReadCursor(actorTech1, taskId, {
        lastReadSequence: 1,
        lastReadMessageId: msg.id,
      });

      const [receipt] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_read_receipts WHERE participantId = (' +
        '  SELECT id FROM chat_participants WHERE conversationId = (' +
        '    SELECT id FROM chat_conversations WHERE taskId = ?' +
        '  ) AND userId = ?' +
        ')',
        taskId,
        userTech1.id
      );
      assert.ok(receipt);
      assert.equal(receipt.lastReadSequence, 1n);

      // Gestor (não participante) avança leitura funcional
      await messageService.advanceReadCursor(actorMgr2, taskId, {
        lastReadSequence: 1,
        lastReadMessageId: msg.id,
      });

      const [functional] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_functional_read_states WHERE userId = ? AND conversationId = (' +
        '  SELECT id FROM chat_conversations WHERE taskId = ?' +
        ')',
        userMgr2.id,
        taskId
      );
      assert.ok(functional);
      assert.equal(functional.lastReadSequence, 1n);
    });

    it('3.8 Bloqueio real por solicitação (REQUEST_PENDING) e trilha em chat_lock_events', async () => {
      const { taskId, cycleId, assignmentId } = await setupTestTask({ title: 'Tarefa 3.8' });

      const requestId = randomUUID();
      await prisma.taskRequest.create({
        data: {
          id: requestId,
          cycleId,
          assignmentId,
          type: 'EXTENSION',
          status: 'PENDING',
          reason: 'Prorrogação para homologação 3.8',
          proposedDeadlineAt: new Date(Date.now() + 86400000),
        },
      });

      await lockService.applyRequestLock(prisma, taskId, cycleId, requestId, userTech1.id);

      const [lockState] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_lock_states WHERE conversationId = (SELECT id FROM chat_conversations WHERE taskId = ?)',
        taskId
      );
      assert.equal(Boolean(lockState.isLocked), true);
      assert.equal(lockState.reason, 'REQUEST_PENDING');
      assert.equal(lockState.requestId, requestId);

      const [event] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_lock_events WHERE requestId = ? ORDER BY createdAt DESC LIMIT 1',
        requestId
      );
      assert.equal(event.eventType, 'LOCK_ACQUIRED');
      assert.equal(event.reason, 'REQUEST_PENDING');
    });

    it('3.9 Desbloqueio real por decisão de solicitação no MariaDB', async () => {
      const { taskId, cycleId, assignmentId } = await setupTestTask({ title: 'Tarefa 3.9' });

      const requestId = randomUUID();
      await prisma.taskRequest.create({
        data: {
          id: requestId,
          cycleId,
          assignmentId,
          type: 'EXTENSION',
          status: 'PENDING',
          reason: 'Prorrogação para homologação 3.9',
          proposedDeadlineAt: new Date(Date.now() + 86400000),
        },
      });

      await lockService.applyRequestLock(prisma, taskId, cycleId, requestId, userTech1.id);

      // Decisão da solicitação
      await lockService.releaseRequestLock(prisma, taskId, cycleId, requestId, userMgr.id, 'APPROVED');

      const [lockStateAfter] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_lock_states WHERE conversationId = (SELECT id FROM chat_conversations WHERE taskId = ?)',
        taskId
      );
      assert.equal(Boolean(lockStateAfter.isLocked), false);
      assert.equal(lockStateAfter.reason, null);

      const [releaseEvent] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_lock_events WHERE requestId = ? ORDER BY createdAt DESC LIMIT 1',
        requestId
      );
      assert.equal(releaseEvent.eventType, 'LOCK_RELEASED');
    });

    it('3.10 Bloqueio real por conclusão/cancelamento (CYCLE_CLOSED)', async () => {
      const { taskId, cycleId } = await setupTestTask({ title: 'Tarefa 3.10' });

      await lockService.applyCycleClosedLock(prisma, taskId, cycleId, userMgr.id);

      const [lockState] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_lock_states WHERE conversationId = (SELECT id FROM chat_conversations WHERE taskId = ?)',
        taskId
      );
      assert.equal(Boolean(lockState.isLocked), true);
      assert.equal(lockState.reason, 'CYCLE_CLOSED');
    });

    it('3.11 Reabertura de ciclo real (CYCLE_REOPENED) atualiza cycle_id e libera bloqueio', async () => {
      const { taskId, cycleId } = await setupTestTask({ title: 'Tarefa 3.11' });

      await lockService.applyCycleClosedLock(prisma, taskId, cycleId, userMgr.id);

      // Conclui formalmente o ciclo 1 para respeitar a constraint task_cycles_one_open_per_task_key
      await prisma.taskCycle.update({
        where: { id: cycleId },
        data: {
          status: 'COMPLETED',
          closedAt: new Date(),
          completionText: 'Ciclo 1 concluído para teste de reabertura',
        },
      });

      const newCycleId = randomUUID();
      await prisma.taskCycle.create({
        data: {
          id: newCycleId,
          taskId: taskId,
          cycleNumber: 2,
          title: 'Ciclo 2 Reaberto',
          description: 'Reabertura de teste real',
          status: 'PENDING',
          openedAt: new Date(),
          version: 1,
        },
      });

      await lockService.releaseCycleClosedLock(prisma, taskId, newCycleId, userMgr.id);

      const [lockState] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_lock_states WHERE conversationId = (SELECT id FROM chat_conversations WHERE taskId = ?)',
        taskId
      );
      assert.equal(Boolean(lockState.isLocked), false);
      assert.equal(lockState.cycleId, newCycleId);

      const [reopenEvent] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_lock_events WHERE cycleId = ? AND eventType = "CYCLE_REOPENED"',
        newCycleId
      );
      assert.ok(reopenEvent);
    });

    it('3.12 Bloqueio e desbloqueio administrativo autorizado (POST /chat/lock)', async () => {
      const { taskId } = await setupTestTask({ title: 'Tarefa 3.12' });

      await lockService.adminLock(actorSec, taskId, {
        isLocked: true,
        reason: 'ADMIN_MAINTENANCE',
        justification: 'Bloqueio administrativo real executado pelo Secretário',
      });

      const [lockState] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_lock_states WHERE conversationId = (SELECT id FROM chat_conversations WHERE taskId = ?)',
        taskId
      );
      assert.equal(Boolean(lockState.isLocked), true);
      assert.equal(lockState.reason, 'ADMIN_MAINTENANCE');

      // Desbloqueio
      await lockService.adminLock(actorSec, taskId, {
        isLocked: false,
        justification: 'Fim do bloqueio administrativo real pelo Secretário',
      });

      const [unlockedState] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_lock_states WHERE conversationId = (SELECT id FROM chat_conversations WHERE taskId = ?)',
        taskId
      );
      assert.equal(Boolean(unlockedState.isLocked), false);
    });

    it('3.13 Triggers de integridade no MariaDB real: chat_lock_events é estritamente append-only', async () => {
      const { taskId, cycleId } = await setupTestTask({ title: 'Tarefa 3.13' });

      // Gera evento
      await lockService.applyCycleClosedLock(prisma, taskId, cycleId, userMgr.id);

      const [event] = await prisma.$queryRawUnsafe('SELECT id FROM chat_lock_events WHERE cycleId = ? LIMIT 1', cycleId);
      assert.ok(event);

      // Tentativa de UPDATE deve disparar trigger trg_chat_lock_events_no_update
      await assert.rejects(
        () => prisma.$queryRawUnsafe('UPDATE chat_lock_events SET reason = "HACKED" WHERE id = ?', event.id),
        (err) => err.message.includes('Chat lock events are append-only')
      );

      // Tentativa de DELETE deve disparar trigger trg_chat_lock_events_no_delete
      await assert.rejects(
        () => prisma.$queryRawUnsafe('DELETE FROM chat_lock_events WHERE id = ?', event.id),
        (err) => err.message.includes('Chat lock events are append-only')
      );
    });
  });

  describe('4. Concorrência Real com Conexões MariaDB Independentes', () => {
    it('4.1 Dois envios simultâneos para a mesma conversa serializam sequências sem colisão', async () => {
      const { taskId } = await setupTestTask({ title: 'Tarefa Concorrência 4.1' });
      await participantService.addParticipant(actorMgr, taskId, userTech2.id);

      const client1 = prisma;
      const client2 = concurrentPrisma;

      const messageService1 = createChatMessageService({ prisma: client1 });
      const messageService2 = createChatMessageService({ prisma: client2 });

      const p1 = messageService1.sendMessage(actorTech1, taskId, {
        content: 'Envio concorrente cliente 1',
        clientMessageId: '770e8400-e29b-41d4-a716-446655440001',
      });

      const p2 = messageService2.sendMessage(actorTech2, taskId, {
        content: 'Envio concorrente cliente 2',
        clientMessageId: '770e8400-e29b-41d4-a716-446655440002',
      });

      const [r1, r2] = await Promise.all([p1, p2]);

      const seqs = [Number(r1.sequenceNumber), Number(r2.sequenceNumber)].sort((a, b) => a - b);
      assert.equal(seqs[1] - seqs[0], 1, 'As sequências devem ser estritamente consecutivas');
    });

    it('4.2 Duas requisições simultâneas com o mesmo clientMessageId retornam exatamente 1 mensagem persistida', async () => {
      const { taskId } = await setupTestTask({ title: 'Tarefa Concorrência 4.2' });

      const client1 = prisma;
      const client2 = concurrentPrisma;

      const messageService1 = createChatMessageService({ prisma: client1 });
      const messageService2 = createChatMessageService({ prisma: client2 });

      const sharedClientMessageId = randomUUID();

      const [r1, r2] = await Promise.all([
        messageService1.sendMessage(actorTech1, taskId, {
          content: 'Mensagem concorrente idempotente',
          clientMessageId: sharedClientMessageId,
        }),
        messageService2.sendMessage(actorTech1, taskId, {
          content: 'Mensagem concorrente idempotente',
          clientMessageId: sharedClientMessageId,
        }),
      ]);

      assert.equal(r1.id, r2.id);
      assert.equal(String(r1.sequenceNumber), String(r2.sequenceNumber));

      const count = await prisma.$queryRawUnsafe(
        'SELECT count(*) as count FROM chat_messages WHERE conversationId = (SELECT id FROM chat_conversations WHERE taskId = ?) AND clientMessageId = ?',
        taskId,
        sharedClientMessageId
      );
      assert.equal(Number(count[0].count), 1);
    });

    it('4.3 Envio de mensagem concorrente com bloqueio é rejeitado atomicamente com 423 CHAT_LOCKED', async () => {
      const { taskId, cycleId, assignmentId } = await setupTestTask({ title: 'Tarefa Concorrência 4.3' });

      const client1 = prisma;
      const client2 = concurrentPrisma;

      const messageService1 = createChatMessageService({ prisma: client1 });
      const lockService2 = createChatLockService({ prisma: client2 });

      const reqId = randomUUID();
      await prisma.taskRequest.create({
        data: {
          id: reqId,
          cycleId,
          assignmentId,
          type: 'EXTENSION',
          status: 'PENDING',
          reason: 'Prorrogação para lock concorrente',
          proposedDeadlineAt: new Date(Date.now() + 86400000),
        },
      });

      // Bloqueia com client 2
      await lockService2.applyRequestLock(client2, taskId, cycleId, reqId, userTech1.id);

      // Tentativa de envio com client 1
      await assert.rejects(
        () => messageService1.sendMessage(actorTech1, taskId, {
          content: 'Envio concorrente bloqueado',
          clientMessageId: randomUUID(),
        }),
        (err) => err instanceof AppError && err.status === 423 && err.code === 'CHAT_LOCKED'
      );
    });

    it('4.4 Envio de mensagem concorrente com remoção de participante é rejeitado com 403 FORBIDDEN', async () => {
      const { taskId } = await setupTestTask({ title: 'Tarefa Concorrência 4.4' });
      await participantService.addParticipant(actorMgr, taskId, userTech2.id);

      const client1 = prisma;
      const client2 = concurrentPrisma;

      const messageService1 = createChatMessageService({ prisma: client1 });
      const participantService2 = createChatParticipantService({ prisma: client2 });

      // Remove tech2 com client 2
      const pTech2 = await client2.chatParticipant.findFirst({ where: { userId: userTech2.id, conversation: { taskId } } });
      await participantService2.removeParticipant(actorMgr, taskId, pTech2.id, 'REMOVED_BY_MANAGER');

      // Tentativa de envio de tech2 com client 1
      await assert.rejects(
        () => messageService1.sendMessage(actorTech2, taskId, {
          content: 'Tentativa de envio pós-remoção',
          clientMessageId: '770e8400-e29b-41d4-a716-446655440005',
        }),
        (err) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
      );
    });

    it('4.5 Duas chamadas simultâneas a ensureConversationForTask criam exatamente 1 conversa', async () => {
      const client1 = prisma;
      const client2 = concurrentPrisma;

      const chatService1 = createChatService({ prisma: client1 });
      const chatService2 = createChatService({ prisma: client2 });

      const newTaskId = randomUUID();
      const newCycleId = randomUUID();

      await prisma.task.create({
        data: {
          id: newTaskId,
          teamId: teamHomologId,
          createdById: userMgr.id,
          version: 1,
        },
      });

      await prisma.taskCycle.create({
        data: {
          id: newCycleId,
          taskId: newTaskId,
          cycleNumber: 1,
          title: 'Tarefa Concorrência Init',
          description: 'Teste concorrência ensure',
          status: 'PENDING',
          openedAt: new Date(),
          version: 1,
        },
      });

      await prisma.task.update({
        where: { id: newTaskId },
        data: { currentCycleId: newCycleId },
      });

      const [c1, c2] = await Promise.all([
        chatService1.ensureConversationForTask(client1, newTaskId, newCycleId, userMgr.id, userTech1.id),
        chatService2.ensureConversationForTask(client2, newTaskId, newCycleId, userMgr.id, userTech1.id),
      ]);

      assert.equal(c1.id, c2.id);

      const count = await prisma.$queryRawUnsafe(
        'SELECT count(*) as count FROM chat_conversations WHERE taskId = ?',
        newTaskId
      );
      assert.equal(Number(count[0].count), 1);
    });
  });

  describe('5. Auditoria de Precedência de Bloqueios Independentes', () => {
    it('5.1 Solicitação aberta -> Bloqueio Admin -> Decisão de solicitação -> Desbloqueio Admin preserva ciclo ativo', async () => {
      const { taskId, cycleId, assignmentId } = await setupTestTask({ title: 'Tarefa Precedência 5.1' });

      // 1. Solicitação aberta (nível 1)
      const reqId = randomUUID();
      await prisma.taskRequest.create({
        data: {
          id: reqId,
          cycleId,
          assignmentId,
          type: 'EXTENSION',
          status: 'PENDING',
          reason: 'Prorrogação para teste de precedência 5.1',
          proposedDeadlineAt: new Date(Date.now() + 86400000),
        },
      });

      await lockService.applyRequestLock(prisma, taskId, cycleId, reqId, userTech1.id);

      let [state] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_lock_states WHERE conversationId = (SELECT id FROM chat_conversations WHERE taskId = ?)',
        taskId
      );
      assert.equal(Boolean(state.isLocked), true);
      assert.equal(state.reason, 'REQUEST_PENDING');

      // 2. Bloqueio administrativo aplicado (nível 3 - máxima precedência)
      await lockService.adminLock(actorAdmin, taskId, {
        isLocked: true,
        reason: 'ADMIN_MAINTENANCE',
        justification: 'Intervenção técnica preventiva de alta prioridade',
      });

      [state] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_lock_states WHERE conversationId = (SELECT id FROM chat_conversations WHERE taskId = ?)',
        taskId
      );
      assert.equal(Boolean(state.isLocked), true);
      assert.equal(state.reason, 'ADMIN_MAINTENANCE');

      // 3. Decisão da solicitação (APPROVED) -> NÃO PODE desbloquear pois ADMIN_MAINTENANCE tem prioridade 3 > 1
      await lockService.releaseRequestLock(prisma, taskId, cycleId, reqId, userMgr.id, 'APPROVED');

      [state] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_lock_states WHERE conversationId = (SELECT id FROM chat_conversations WHERE taskId = ?)',
        taskId
      );
      assert.equal(Boolean(state.isLocked), true);
      assert.equal(state.reason, 'ADMIN_MAINTENANCE');

      // 4. Desbloqueio administrativo aplicado -> como a solicitação já foi decidida e o ciclo está ativo, libera totalmente
      await lockService.adminLock(actorAdmin, taskId, {
        isLocked: false,
        justification: 'Fim da intervenção técnica com validação do ciclo ativo',
      });

      [state] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_lock_states WHERE conversationId = (SELECT id FROM chat_conversations WHERE taskId = ?)',
        taskId
      );
      assert.equal(Boolean(state.isLocked), false);
      assert.equal(state.reason, null);
    });

    it('5.2 Tarefa concluída sob bloqueio administrativo reverte para CYCLE_CLOSED quando desbloqueada administrativamente', async () => {
      const { taskId, cycleId } = await setupTestTask({ title: 'Tarefa Precedência 5.2' });

      // 1. Conclui ciclo respeitando constraints do MariaDB
      await lockService.applyCycleClosedLock(prisma, taskId, cycleId, userMgr.id);
      await prisma.taskCycle.update({
        where: { id: cycleId },
        data: { status: 'COMPLETED', closedAt: new Date(), completionText: 'Homologação concluída 5.2' }
      });

      let [state] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_lock_states WHERE conversationId = (SELECT id FROM chat_conversations WHERE taskId = ?)',
        taskId
      );
      assert.equal(state.reason, 'CYCLE_CLOSED');

      // 2. Bloqueio administrativo aplicado em tarefa concluída
      await lockService.adminLock(actorAdmin, taskId, {
        isLocked: true,
        reason: 'ADMIN_MAINTENANCE',
        justification: 'Bloqueio administrativo sobre tarefa concluída',
      });

      [state] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_lock_states WHERE conversationId = (SELECT id FROM chat_conversations WHERE taskId = ?)',
        taskId
      );
      assert.equal(state.reason, 'ADMIN_MAINTENANCE');

      // 3. Desbloqueio administrativo -> DEVE reverter para CYCLE_CLOSED e permanecer bloqueado!
      await lockService.adminLock(actorAdmin, taskId, {
        isLocked: false,
        justification: 'Remoção de bloqueio administrativo, restaurando estado do ciclo',
      });

      [state] = await prisma.$queryRawUnsafe(
        'SELECT * FROM chat_lock_states WHERE conversationId = (SELECT id FROM chat_conversations WHERE taskId = ?)',
        taskId
      );
      assert.equal(Boolean(state.isLocked), true);
      assert.equal(state.reason, 'CYCLE_CLOSED');
    });
  });

  describe('6. Privacidade, Visibilidade Histórica e RBAC Real', () => {
    it('6.1 Técnico removido tem acesso apenas a mensagens enviadas durante seus períodos ativos', async () => {
      const { taskId } = await setupTestTask({ title: 'Tarefa Privacidade 6.1' });

      // 1. userTech3 é adicionado à conversa
      await participantService.addParticipant(actorMgr, taskId, userTech3.id);

      // 2. userTech1 envia mensagem (tech3 está ativo)
      const msgDuring = await messageService.sendMessage(actorTech1, taskId, {
        content: 'Mensagem enquanto tech3 está ativo',
        clientMessageId: '880e8400-e29b-41d4-a716-446655440001',
      });

      // 3. userTech3 é removido
      const pTech3 = await prisma.chatParticipant.findFirst({ where: { userId: userTech3.id, conversation: { taskId } } });
      await participantService.removeParticipant(actorMgr, taskId, pTech3.id, 'REMOVED_BY_MANAGER');

      // 4. userTech1 envia mensagem (tech3 está removido)
      const msgAfter = await messageService.sendMessage(actorTech1, taskId, {
        content: 'Mensagem enquanto tech3 está removido (invisível para ele)',
        clientMessageId: '880e8400-e29b-41d4-a716-446655440002',
      });

      // 5. userTech3 consulta o histórico
      const tech3History = await messageService.listMessages(actorTech3, taskId, { limit: 20 });

      assert.ok(tech3History.items.some((m) => m.id === msgDuring.id), 'DEVE visualizar mensagem do seu período');
      assert.ok(!tech3History.items.some((m) => m.id === msgAfter.id), 'NÃO PODE visualizar mensagem após sua remoção');
    });

    it('6.2 Gestor de outra equipe tem leitura e ações bloqueadas com 403 FORBIDDEN', async () => {
      const { taskId } = await setupTestTask({ title: 'Tarefa Privacidade 6.2' });

      await assert.rejects(
        () => messageService.listMessages(actorMgrOther, taskId, {}),
        (err) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
      );

      await assert.rejects(
        () => participantService.addParticipant(actorMgrOther, taskId, userTech3.id),
        (err) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
      );
    });

    it('6.3 Admin Master e Secretário não possuem acesso automático ao conteúdo textual das conversas (403 FORBIDDEN)', async () => {
      const { taskId } = await setupTestTask({ title: 'Tarefa Privacidade 6.3' });

      await assert.rejects(
        () => messageService.listMessages(actorAdmin, taskId, {}),
        (err) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
      );

      await assert.rejects(
        () => messageService.listMessages(actorSec, taskId, {}),
        (err) => err instanceof AppError && err.status === 403 && err.code === 'FORBIDDEN'
      );
    });

    it('6.4 Gestor da equipe da tarefa tem acesso funcional completo às mensagens', async () => {
      const { taskId } = await setupTestTask({ title: 'Tarefa Privacidade 6.4' });

      await messageService.sendMessage(actorTech1, taskId, {
        content: 'Mensagem visível para gestor',
        clientMessageId: '880e8400-e29b-41d4-a716-446655440015',
      });

      const mgrHistory = await messageService.listMessages(actorMgr, taskId, { limit: 20 });
      assert.ok(mgrHistory.items.length >= 1);
    });
  });

  describe('7. Cursores e Integridade de BigInt', () => {
    it('7.1 Preserva sequenceNumber seguro na serialização JSON e BigInt no banco', async () => {
      const { taskId } = await setupTestTask({ title: 'Tarefa Cursores 7.1' });

      await messageService.sendMessage(actorTech1, taskId, {
        content: 'Mensagem para teste de sequência BigInt',
        clientMessageId: '990e8400-e29b-41d4-a716-446655440001',
      });

      const history = await messageService.listMessages(actorTech1, taskId, { limit: 5 });
      assert.ok(history.items.length >= 1);
      for (const item of history.items) {
        // safeBigInt converte valores <= MAX_SAFE_INTEGER para number e superiores para string
        assert.ok(typeof item.sequenceNumber === 'number' || typeof item.sequenceNumber === 'string');
      }
    });

    it('7.2 Rejeita avanço de cursor para mensagens inexistentes ou com sequência além do histórico', async () => {
      const { taskId } = await setupTestTask({ title: 'Tarefa Cursores 7.2' });

      await assert.rejects(
        () => messageService.advanceReadCursor(actorTech1, taskId, {
          lastReadSequence: 999999,
          lastReadMessageId: '550e8400-e29b-41d4-a716-446655449999',
        }),
        (err) => err instanceof AppError && (err.status === 404 || err.status === 422)
      );
    });
  });
});
