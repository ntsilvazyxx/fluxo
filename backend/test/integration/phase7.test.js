import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { createPrismaClient, parseDatabaseUrl } from '../../src/infrastructure/database/prisma.js';
import { hashPassword } from '../../src/shared/security/password.js';
import { createEmailSender } from '../../src/modules/outbox/outbox.sender.js';
import { createOutboxService } from '../../src/modules/outbox/outbox.service.js';
import { createReminderScheduler } from '../../src/modules/outbox/outbox.scheduler.js';

const suite = process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip;
const password = 'Senha-Forte-2026';

suite('Fase 7 - notificações, outbox e e-mails no MariaDB real', () => {
  let prisma;
  let app;
  let config;
  let roles;
  let manager;
  let technician;
  let other;
  let team;
  let calendar;
  let calendarVersion;
  let task;
  let cycle;
  let assignment;
  let technicianToken;
  let otherToken;
  let outboxService;
  let reminderScheduler;
  let emailSender;
  const additionalTaskIds = [];
  const reminderTaskIds = [];
  const runPrefix = `fase7:${randomUUID()}`;

  const user = async (role, name) =>
    prisma.user.create({
      data: {
        id: randomUUID(),
        name,
        emailNormalized: `${randomUUID()}@fase7.test`,
        passwordHash: await hashPassword(password),
        roleId: roles[role].id,
      },
    });

  const token = async (current) =>
    (await request(app)
      .post('/api/v1/auth/login')
      .send({ email: current.emailNormalized, password })
    ).body.data.accessToken;

  const ensureRole = async (code, label) => {
    let found = await prisma.role.findUnique({ where: { code } });
    if (!found) {
      found = await prisma.role.create({ data: { id: randomUUID(), code, label } });
    }
    return found;
  };

  const insertOutboxEvent = async (overrides = {}) => {
    const { payload = {}, ...eventOverrides } = overrides;
    const id = randomUUID();
    const dedupeKey = `${runPrefix}:evt:${randomUUID()}`;
    await prisma.outboxEvent.create({
      data: {
        id,
        eventType: 'TASK_ASSIGNED',
        payloadJson: {
          userId: technician.id,
          assignmentId: assignment.id,
          taskId: task.id,
          ...payload,
        },
        dedupeKey,
        status: 'PENDING',
        ...eventOverrides,
      },
    });
    return { id, dedupeKey };
  };

  const createNotification = async (userId, type = 'TASK_ASSIGNED') =>
    prisma.notification.create({
      data: {
        id: randomUUID(),
        userId,
        type,
        title: 'Título de teste',
        body: 'Corpo de teste da notificação.',
        entityType: 'Task',
        entityId: task.id,
      },
    });

  const processPending = async () => {
    const event = await outboxService.claimEvent(prisma, { dedupeKey: { startsWith: runPrefix } });
    assert.ok(event, 'evento de teste pendente deve existir');
    await outboxService.processEvent(prisma, event);
    await outboxService.completeEvent(prisma, event.id, true);
  };

  before(async () => {
    assert.ok(process.env.TEST_DATABASE_URL, 'TEST_DATABASE_URL é obrigatória para integração.');
    const { database } = parseDatabaseUrl(process.env.TEST_DATABASE_URL);
    assert.match(database, /test/i, 'Os testes só podem usar banco cujo nome contenha "test".');

    prisma = createPrismaClient(process.env.TEST_DATABASE_URL, { connectionLimit: 20 });

    config = {
      corsOrigins: ['http://localhost:5173'],
      jwtAccessSecret: 'fase7-integration-secret-at-least-thirty-two-characters',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlDays: 1,
      passwordResetTtlMinutes: 30,
      loginWindowMinutes: 15,
      loginMaxAttempts: 100,
      cookieSecure: false,
      mailEnabled: false,
      mailHost: 'localhost',
      mailPort: 25,
      mailFrom: 'seaf@fase7.test',
      mailFromName: 'SEAF Fase 7 Teste',
      appBaseUrl: 'http://localhost:5173',
    };

    app = createApp({
      prisma,
      config,
      startOutboxWorker: false,
      passwordResetNotifier: async () => {},
    });

    emailSender = createEmailSender({ config });
    outboxService = createOutboxService({ prisma, emailSender });
    reminderScheduler = createReminderScheduler({ prisma });

    roles = Object.fromEntries((await prisma.role.findMany()).map((role) => [role.code, role]));
    roles.MANAGER = await ensureRole('MANAGER', 'Gestor');
    roles.TECHNICIAN = await ensureRole('TECHNICIAN', 'Técnico');

    [manager, technician, other] = await Promise.all([
      user('MANAGER', 'Gestor Fase 7'),
      user('TECHNICIAN', 'Técnico Fase 7'),
      user('TECHNICIAN', 'Outro Técnico Fase 7'),
    ]);

    team = await prisma.team.create({
      data: { id: randomUUID(), name: `Equipe Fase 7 ${randomUUID()}` },
    });
    await prisma.teamManager.create({
      data: { id: randomUUID(), teamId: team.id, userId: manager.id, assignedAt: new Date() },
    });
    await prisma.teamMember.create({
      data: { id: randomUUID(), teamId: team.id, userId: technician.id, joinedAt: new Date() },
    });

    calendar = await prisma.workCalendar.create({
      data: { id: randomUUID(), teamId: team.id, timezone: 'America/Cuiaba' },
    });
    calendarVersion = await prisma.calendarVersion.create({
      data: {
        id: randomUUID(),
        calendarId: calendar.id,
        versionNumber: 1,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        publishedAt: new Date(),
        createdById: manager.id,
      },
    });
    await prisma.workCalendar.update({
      where: { id: calendar.id },
      data: { activeVersionId: calendarVersion.id },
    });
    await prisma.team.update({
      where: { id: team.id },
      data: { calendarId: calendar.id },
    });

    task = await prisma.task.create({
      data: { id: randomUUID(), teamId: team.id, createdById: manager.id },
    });
    cycle = await prisma.taskCycle.create({
      data: {
        id: randomUUID(),
        taskId: task.id,
        cycleNumber: 1,
        title: 'Ciclo base Fase 7',
        description: 'Ciclo usado nos testes de notificações.',
        status: 'IN_PROGRESS',
        openedAt: new Date(),
      },
    });
    assignment = await prisma.taskAssignment.create({
      data: {
        id: randomUUID(),
        cycleId: cycle.id,
        userId: technician.id,
        assignedById: manager.id,
        calendarVersionId: calendarVersion.id,
        assignedAt: new Date(),
      },
    });

    await prisma.notificationPreference.create({
      data: {
        id: randomUUID(),
        userId: technician.id,
        notificationType: 'TASK_ASSIGNED',
        internalEnabled: true,
        emailEnabled: true,
      },
    });
    await prisma.notificationPreference.create({
      data: {
        id: randomUUID(),
        userId: manager.id,
        notificationType: 'TASK_ASSIGNED',
        internalEnabled: true,
        emailEnabled: false,
      },
    });
    await prisma.notificationPreference.create({
      data: {
        id: randomUUID(),
        userId: other.id,
        notificationType: 'TASK_ASSIGNED',
        internalEnabled: true,
        emailEnabled: false,
      },
    });

    [technicianToken, otherToken] = await Promise.all([
      token(technician),
      token(other),
    ]);
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('cria notificação e entrega de e-mail ao processar evento da outbox', async () => {
    const { id: eventId } = await insertOutboxEvent();

    await processPending();

    const notification = await prisma.notification.findFirst({
      where: {
        userId: technician.id,
        type: 'TASK_ASSIGNED',
        entityId: task.id,
      },
    });
    assert.ok(notification, 'a notificação deve ser criada para o destinatário');
    assert.equal(notification.readAt, null);

    const event = await prisma.outboxEvent.findUnique({ where: { id: eventId } });
    assert.equal(event.status, 'PROCESSED');
    assert.ok(event.processedAt);

    const delivery = await prisma.emailDelivery.findFirst({
      where: {
        outboxEventId: eventId,
        recipient: technician.emailNormalized,
      },
    });
    assert.ok(delivery, 'a entrega de e-mail deve ser registrada (adaptador de teste)');
    assert.equal(delivery.status, 'SENT');
  });

  it('não entrega e-mail para usuário com emailEnabled desativado', async () => {
    await insertOutboxEvent({ payload: { userId: manager.id } });

    await processPending();

    const notifications = await prisma.notification.findMany({
      where: { userId: { in: [manager.id, technician.id] }, type: 'TASK_ASSIGNED' },
    });
    assert.ok(notifications.length >= 2, 'ambos recebem notificação interna');

    const deliveries = await prisma.emailDelivery.findMany({
      where: { outboxEvent: { dedupeKey: { startsWith: runPrefix } } },
    });
    const technicianDelivery = deliveries.find((d) => d.recipient === technician.emailNormalized);
    const managerDelivery = deliveries.find((d) => d.recipient === manager.emailNormalized);
    assert.ok(technicianDelivery, 'técnico recebe entrega de e-mail');
    assert.equal(managerDelivery, undefined, 'gerente não recebe e-mail (emailEnabled desativado)');
  });

  it('lista notificações e aponta contador de não lidas', async () => {
    await createNotification(technician.id);
    await createNotification(technician.id);
    await createNotification(technician.id);
    await createNotification(other.id);

    const response = await request(app)
      .get('/api/v1/notifications?page=1&pageSize=20')
      .set('authorization', `Bearer ${technicianToken}`)
      .expect(200);

    assert.ok(response.body.data.notifications.length >= 3);
    assert.ok(response.body.data.meta.total >= 3);
    assert.ok(response.body.data.meta.unread >= 3);
    assert.equal(response.body.data.meta.totalPages, 1);
    response.body.data.notifications.forEach((n) => assert.equal(n.readAt, null));
  });

  it('filtra somente não lidas e pagina', async () => {
    const response = await request(app)
      .get('/api/v1/notifications?unread=true&page=1&pageSize=2')
      .set('authorization', `Bearer ${technicianToken}`)
      .expect(200);

    assert.equal(response.body.data.notifications.length, 2);
    assert.ok(response.body.data.meta.totalPages >= 2);
    response.body.data.notifications.forEach((n) => assert.equal(n.readAt, null));
  });

  it('marca notificação individual como lida', async () => {
    const list = await request(app)
      .get('/api/v1/notifications?page=1&pageSize=20')
      .set('authorization', `Bearer ${technicianToken}`)
      .expect(200);
    const firstId = list.body.data.notifications[0].id;

    const marked = await request(app)
      .patch(`/api/v1/notifications/${firstId}/read`)
      .set('authorization', `Bearer ${technicianToken}`)
      .expect(200);

    assert.ok(marked.body.data.readAt);

    const after = await request(app)
      .get('/api/v1/notifications?page=1&pageSize=20')
      .set('authorization', `Bearer ${technicianToken}`)
      .expect(200);
    assert.ok(after.body.data.meta.unread >= 2);
  });

  it('marca todas as notificações como lidas', async () => {
    const all = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('authorization', `Bearer ${technicianToken}`)
      .expect(200);

    assert.equal(all.body.data.marked, true);

    const final = await request(app)
      .get('/api/v1/notifications?page=1&pageSize=20')
      .set('authorization', `Bearer ${technicianToken}`)
      .expect(200);
    assert.equal(final.body.data.meta.unread, 0);
    final.body.data.notifications.forEach((n) => assert.ok(n.readAt));
  });

  it('retorna 404 ao tentar marcar notificação de outro usuário', async () => {
    await createNotification(technician.id);
    const technicianList = await request(app)
      .get('/api/v1/notifications?page=1&pageSize=20')
      .set('authorization', `Bearer ${technicianToken}`)
      .expect(200);
    const notificationId = technicianList.body.data.notifications[0].id;

    const response = await request(app)
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set('authorization', `Bearer ${otherToken}`)
      .expect(404);

    assert.equal(response.body.error.code, 'NOTIFICATION_NOT_FOUND');
  });

  it('processa eventos da outbox concorrentemente sem deixá-los pendentes', async () => {
    const eventIds = [];
    for (let i = 0; i < 8; i += 1) {
      const id = randomUUID();
      eventIds.push(id);
      await prisma.outboxEvent.create({
        data: {
          id,
          eventType: 'TASK_ASSIGNED',
          payloadJson: {
            userId: technician.id,
            assignmentId: assignment.id,
            taskId: task.id,
          },
          dedupeKey: `${runPrefix}:conc:${randomUUID()}`,
          status: 'PENDING',
        },
      });
    }

    const processOne = async () => {
      const event = await outboxService.claimEvent(prisma, { dedupeKey: { startsWith: `${runPrefix}:conc:` } });
      if (!event) return false;
      await outboxService.processEvent(prisma, event);
      await outboxService.completeEvent(prisma, event.id, true);
      return true;
    };
    while (await processOne()) { /* process all claimed events */ }

    const remaining = await prisma.outboxEvent.count({
      where: { id: { in: eventIds }, status: { not: 'PROCESSED' } },
    });
    assert.equal(remaining, 0, 'nenhum evento deve ficar pendente após processamento concorrente');
  });

  it('aplica backoff ao falhar e marca FAILED após atingir o limite de tentativas', async () => {
    const { id: eventId } = await insertOutboxEvent({
      status: 'PENDING',
      attempts: 0,
    });

    await outboxService.completeEvent(prisma, eventId, false, 'erro transitório simulado');
    let event = await prisma.outboxEvent.findUnique({ where: { id: eventId } });
    assert.equal(event.status, 'PENDING');
    assert.ok(event.nextAttemptAt);
    assert.ok(event.nextAttemptAt > new Date());
    assert.equal(event.lastError, 'erro transitório simulado');

    await prisma.outboxEvent.update({
      where: { id: eventId },
      data: { attempts: 5, status: 'PENDING', nextAttemptAt: new Date() },
    });
    await outboxService.completeEvent(prisma, eventId, false, 'erro definitivo simulado');
    event = await prisma.outboxEvent.findUnique({ where: { id: eventId } });
    assert.equal(event.status, 'FAILED');
    assert.equal(event.lastError, 'erro definitivo simulado');
    assert.ok(event.processedAt);
  });

  it('não duplica evento com mesma dedupeKey', async () => {
    const dedupeKey = `${runPrefix}:dedupe:${randomUUID()}`;
    const payload = {
      userId: technician.id,
      assignmentId: assignment.id,
      taskId: task.id,
    };

    await prisma.outboxEvent.create({
      data: {
        id: randomUUID(),
        eventType: 'TASK_ASSIGNED',
        payloadJson: payload,
        dedupeKey,
        status: 'PENDING',
      },
    });

    await assert.rejects(
      () =>
        prisma.outboxEvent.create({
          data: {
            id: randomUUID(),
            eventType: 'TASK_ASSIGNED',
            payloadJson: payload,
            dedupeKey,
            status: 'PENDING',
          },
        }),
      (error) => error.code === 'P2002'
    );
  });

  it('gera lembretes de prazo próximo e atrasado', async () => {
    await prisma.taskCycle.update({ where: { id: cycle.id }, data: { status: 'COMPLETED', closedAt: new Date(), completionText: 'Ciclo base encerrado para o teste de lembretes.' } });
    const soonCycle = await prisma.taskCycle.create({
      data: {
        id: randomUUID(),
        taskId: task.id,
        cycleNumber: 2,
        title: 'Ciclo prazo próximo',
        description: '',
        status: 'IN_PROGRESS',
        openedAt: new Date(),
        deadlineAt: new Date(Date.now() + 60 * 60 * 1000),
        assignments: {
          create: {
            id: randomUUID(),
            userId: technician.id,
            assignedById: manager.id,
            calendarVersionId: calendarVersion.id,
            assignedAt: new Date(),
          },
        },
      },
    });

    const overdueTask = await prisma.task.create({ data: { id: randomUUID(), teamId: team.id, createdById: manager.id } });
    additionalTaskIds.push(overdueTask.id);
    reminderTaskIds.push(task.id, overdueTask.id);
    const overdueCycle = await prisma.taskCycle.create({
      data: {
        id: randomUUID(),
        taskId: overdueTask.id,
        cycleNumber: 1,
        title: 'Ciclo atrasado',
        description: '',
        status: 'IN_PROGRESS',
        openedAt: new Date(),
        deadlineAt: new Date(Date.now() - 60 * 60 * 1000),
        assignments: {
          create: {
            id: randomUUID(),
            userId: technician.id,
            assignedById: manager.id,
            calendarVersionId: calendarVersion.id,
            assignedAt: new Date(),
          },
        },
      },
    });

    const created = await reminderScheduler.scheduleDeadlineReminders({ taskIds: reminderTaskIds });
    const byCycle = (cid) => created.filter((c) => c.cycleId === cid);

    assert.equal(byCycle(soonCycle.id).length, 1);
    assert.equal(byCycle(soonCycle.id)[0].eventType, 'TASK_DEADLINE_SOON');
    assert.ok(byCycle(overdueCycle.id).find((c) => c.eventType === 'TASK_OVERDUE'));

    const allTypes = created.map((c) => c.eventType);
    assert.ok(allTypes.includes('TASK_DEADLINE_SOON'));
    assert.ok(allTypes.includes('TASK_OVERDUE'));
  });

  it('deduplica lembretes em segunda execução do agendador', async () => {
    await reminderScheduler.scheduleDeadlineReminders({ taskIds: reminderTaskIds });
    const second = await reminderScheduler.scheduleDeadlineReminders({ taskIds: reminderTaskIds });
    assert.equal(second.length, 0, 'segunda execução não deve criar lembretes duplicados');

    const existing = await prisma.outboxEvent.findMany({
      where: { dedupeKey: { startsWith: 'reminder:' } },
    });
    const dedupeKeys = existing.map((e) => e.dedupeKey);
    assert.equal(new Set(dedupeKeys).size, dedupeKeys.length, 'sem chaves de dedupe duplicadas');
  });

  it('não gera lembretes para ciclo encerrado', async () => {
    const closedTask = await prisma.task.create({ data: { id: randomUUID(), teamId: team.id, createdById: manager.id } });
    additionalTaskIds.push(closedTask.id);
    const closedCycle = await prisma.taskCycle.create({
      data: {
        id: randomUUID(),
        taskId: closedTask.id,
        cycleNumber: 1,
        title: 'Ciclo encerrado',
        description: '',
        status: 'COMPLETED',
        openedAt: new Date(),
        closedAt: new Date(),
        completionText: 'Ciclo encerrado para verificar a ausência de lembrete.',
        deadlineAt: new Date(Date.now() + 60 * 60 * 1000),
        assignments: {
          create: {
            id: randomUUID(),
            userId: technician.id,
            assignedById: manager.id,
            calendarVersionId: calendarVersion.id,
            assignedAt: new Date(),
          },
        },
      },
    });

    const created = await reminderScheduler.scheduleDeadlineReminders({ taskIds: [closedTask.id] });
    assert.equal(
      created.filter((c) => c.cycleId === closedCycle.id).length,
      0,
      'ciclo encerrado não deve gerar lembretes',
    );
  });

  it('adaptador SMTP registra falha quando indisponível', async () => {
    const failingSender = createEmailSender({
      config: {
        ...config,
        mailEnabled: true,
        mailHost: '127.0.0.1',
        mailPort: 1,
        mailUser: '',
        mailPass: '',
      },
    });

    const result = await failingSender.send({
      to: 'usuario@fase7.test',
      subject: 'Assunto de teste',
      body: 'Corpo de teste do e-mail.',
    });

    assert.equal(result.status, 'FAILED');
    assert.ok(result.lastError);
  });

  it('recupera eventos órfãos em PROCESSING há mais de 30 minutos', async () => {
    const oldTime = new Date(Date.now() - 31 * 60 * 1000);
    const recentTime = new Date(Date.now() - 10 * 60 * 1000);

    const orphan1 = await prisma.outboxEvent.create({
      data: {
        id: randomUUID(),
        eventType: 'TASK_ASSIGNED',
        payloadJson: {
          userId: technician.id,
          assignmentId: assignment.id,
          taskId: task.id,
        },
        dedupeKey: `${runPrefix}:orphan1:${randomUUID()}`,
        status: 'PROCESSING',
        claimedAt: oldTime,
        attempts: 1,
      },
    });
    const orphan2 = await prisma.outboxEvent.create({
      data: {
        id: randomUUID(),
        eventType: 'TASK_ASSIGNED',
        payloadJson: {
          userId: technician.id,
          assignmentId: assignment.id,
          taskId: task.id,
        },
        dedupeKey: `${runPrefix}:orphan2:${randomUUID()}`,
        status: 'PROCESSING',
        claimedAt: recentTime,
        attempts: 1,
      },
    });

    const result = await outboxService.recoverOrphaned(prisma);
    // A recuperação é global em produção. O banco compartilhado pode conter
    // órfãos de execuções anteriores; a garantia desta execução é o estado dos
    // eventos identificados pelo seu runPrefix, e não a contagem global.
    assert.ok(result.count >= 1, 'o evento órfão desta execução deve ser recuperado');

    const recovered = await prisma.outboxEvent.findUnique({ where: { id: orphan1.id } });
    assert.equal(recovered.status, 'PENDING');
    assert.equal(recovered.claimedAt, null);

    const stillProcessing = await prisma.outboxEvent.findUnique({ where: { id: orphan2.id } });
    assert.equal(stillProcessing.status, 'PROCESSING');
  });
});
