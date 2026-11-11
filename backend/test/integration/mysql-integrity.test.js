import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import {
  createPrismaClient,
  parseDatabaseUrl,
} from '../../src/infrastructure/database/prisma.js';

const integrationEnabled = process.env.RUN_DATABASE_INTEGRATION === '1';
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

const oneSuccessAndOneFailure = (results) => {
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
};

describe('integridade no MariaDB 10.11 real', { skip: !integrationEnabled }, () => {
  let prisma;
  let concurrentPrisma;
  let role;
  let author;
  let responsible;
  let team;
  let calendarVersion;
  let rootTask;
  let rootCycle;

  before(async () => {
    assert.ok(testDatabaseUrl, 'TEST_DATABASE_URL é obrigatória para integração.');
    const { database } = parseDatabaseUrl(testDatabaseUrl);
    assert.match(database, /test/i, 'Os testes só podem usar banco cujo nome contenha "test".');

    prisma = createPrismaClient(testDatabaseUrl, { connectionLimit: 3 });
    concurrentPrisma = createPrismaClient(testDatabaseUrl, { connectionLimit: 3 });

    const [server] = await prisma.$queryRaw`SELECT VERSION() AS version`;
    assert.match(server.version, /^10\.11\.\d+-MariaDB/i, 'A suíte exige MariaDB 10.11.x.');

    role = await prisma.role.upsert({
      where: { code: 'TECHNICIAN' },
      update: { label: 'Técnico' },
      create: {
        id: '00000000-0000-4000-8000-000000000004',
        code: 'TECHNICIAN',
        label: 'Técnico',
      },
    });

    author = await prisma.user.create({
      data: {
        id: randomUUID(),
        name: 'Autor de teste de persistência',
        emailNormalized: `${randomUUID()}@test.invalid`,
        passwordHash: 'not-a-real-password-hash',
        roleId: role.id,
      },
    });

    responsible = await prisma.user.create({
      data: {
        id: randomUUID(),
        name: 'Responsável de teste de persistência',
        emailNormalized: `${randomUUID()}@test.invalid`,
        passwordHash: 'not-a-real-password-hash',
        roleId: role.id,
      },
    });

    team = await prisma.team.create({
      data: {
        id: randomUUID(),
        name: `Equipe de teste ${randomUUID()}`,
      },
    });

    const calendar = await prisma.workCalendar.create({
      data: {
        id: randomUUID(),
        teamId: team.id,
        timezone: 'America/Cuiaba',
      },
    });

    calendarVersion = await prisma.calendarVersion.create({
      data: {
        id: randomUUID(),
        calendarId: calendar.id,
        versionNumber: 1,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        createdById: author.id,
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

    rootTask = await prisma.task.create({
      data: {
        id: randomUUID(),
        teamId: team.id,
        createdById: author.id,
      },
    });
  });

  after(async () => {
    await Promise.allSettled([prisma?.$disconnect(), concurrentPrisma?.$disconnect()]);
  });

  it('permite apenas um ciclo aberto quando duas conexões gravam simultaneamente', async () => {
    const cycleData = (title) => ({
      id: randomUUID(),
      taskId: rootTask.id,
      cycleNumber: 1,
      title,
      description: 'Ciclo criado pelo teste de concorrência.',
      openedAt: new Date(),
    });

    const results = await Promise.allSettled([
      prisma.taskCycle.create({ data: cycleData('Ciclo concorrente A') }),
      concurrentPrisma.taskCycle.create({ data: cycleData('Ciclo concorrente B') }),
    ]);

    oneSuccessAndOneFailure(results);
    rootCycle = results.find(({ status }) => status === 'fulfilled').value;

    await prisma.task.update({
      where: { id: rootTask.id },
      data: { currentCycleId: rootCycle.id },
    });

    assert.equal(
      await prisma.taskCycle.count({ where: { taskId: rootTask.id, closedAt: null } }),
      1,
    );
  });

  it('permite apenas uma atribuição atual por ciclo sob concorrência', async () => {
    const assignmentData = () => ({
      id: randomUUID(),
      cycleId: rootCycle.id,
      userId: responsible.id,
      assignedById: author.id,
      calendarVersionId: calendarVersion.id,
      assignedAt: new Date(),
    });

    const results = await Promise.allSettled([
      prisma.taskAssignment.create({ data: assignmentData() }),
      concurrentPrisma.taskAssignment.create({ data: assignmentData() }),
    ]);

    oneSuccessAndOneFailure(results);
    assert.equal(
      await prisma.taskAssignment.count({ where: { cycleId: rootCycle.id, endedAt: null } }),
      1,
    );
  });

  it('impede solicitação ligada a atribuição de outro ciclo', async () => {
    const secondTask = await prisma.task.create({
      data: { id: randomUUID(), teamId: team.id, createdById: author.id },
    });
    const secondCycle = await prisma.taskCycle.create({
      data: {
        id: randomUUID(),
        taskId: secondTask.id,
        cycleNumber: 1,
        title: 'Segundo ciclo para FK composta',
        description: 'Valida assignmentId e cycleId.',
        openedAt: new Date(),
      },
    });
    const secondAssignment = await prisma.taskAssignment.create({
      data: {
        id: randomUUID(),
        cycleId: secondCycle.id,
        userId: responsible.id,
        assignedById: author.id,
        calendarVersionId: calendarVersion.id,
        assignedAt: new Date(),
      },
    });

    await assert.rejects(() =>
      prisma.taskRequest.create({
        data: {
          id: randomUUID(),
          cycleId: rootCycle.id,
          assignmentId: secondAssignment.id,
          type: 'RETURN',
          reason: 'Tentativa inválida de vínculo cruzado.',
        },
      }),
    );
  });

  it('impede subtarefa de subtarefa', async () => {
    const subtask = await prisma.task.create({
      data: {
        id: randomUUID(),
        teamId: team.id,
        createdById: author.id,
        parentCycleId: rootCycle.id,
      },
    });
    const subtaskCycle = await prisma.taskCycle.create({
      data: {
        id: randomUUID(),
        taskId: subtask.id,
        cycleNumber: 1,
        title: 'Ciclo da subtarefa',
        description: 'Base para validar profundidade máxima.',
        openedAt: new Date(),
      },
    });

    await assert.rejects(() =>
      prisma.task.create({
        data: {
          id: randomUUID(),
          teamId: team.id,
          createdById: author.id,
          parentCycleId: subtaskCycle.id,
        },
      }),
    );
  });

  it('rejeita períodos sobrepostos e alteração de auditoria', async () => {
    await assert.rejects(() =>
      prisma.calendarVersion.create({
        data: {
          id: randomUUID(),
          calendarId: calendarVersion.calendarId,
          versionNumber: 2,
          effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
          createdById: author.id,
        },
      }),
    );

    const event = await prisma.auditEvent.create({
      data: {
        id: randomUUID(),
        actorId: author.id,
        entityType: 'Task',
        entityId: rootTask.id,
        action: 'INTEGRITY_TEST',
        correlationId: randomUUID(),
      },
    });

    await assert.rejects(() =>
      prisma.auditEvent.update({
        where: { id: event.id },
        data: { reason: 'Alteração que deve ser recusada.' },
      }),
    );
  });

  it('preserva histórico referenciado contra exclusão física', async () => {
    await assert.rejects(() => prisma.user.delete({ where: { id: responsible.id } }));
  });
});
