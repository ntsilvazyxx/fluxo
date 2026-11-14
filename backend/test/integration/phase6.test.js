import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';

import { createIntegrationApp as createApp } from '../../testing/integration/context.js';
import { createIntegrationPrisma as createPrismaClient } from '../../testing/integration/context.js';
import { createFileImageStorage } from '../../src/modules/images/image.storage.js';
import { hashPassword } from '../../src/shared/security/password.js';

const suite = process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip;
const password = 'Senha-Forte-2026';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const config = {
  corsOrigins: ['http://localhost:5173'],
  jwtAccessSecret: 'integration-secret-at-least-thirty-two-characters',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlDays: 1,
  passwordResetTtlMinutes: 30,
  loginWindowMinutes: 15,
  loginMaxAttempts: 100,
  cookieSecure: false,
};

suite('Fase 6 - imagens protegidas no MariaDB real', () => {
  let prisma;
  let app;
  let storage;
  let storageRoot;
  let roles;
  let manager;
  let technician;
  let other;
  let team;
  let managerToken;
  let technicianToken;
  let otherToken;

  const user = async (role, name) => prisma.user.create({
    data: {
      id: randomUUID(),
      name,
      emailNormalized: `${randomUUID()}@fase6.test`,
      passwordHash: await hashPassword(password),
      roleId: roles[role].id,
    },
  });
  const token = async (current) => (await request(app).post('/api/v1/auth/login').send({
    email: current.emailNormalized,
    password,
  })).body.data.accessToken;
  const createTask = async () => {
    const created = await request(app)
      .post('/api/v1/tasks')
      .set('authorization', `Bearer ${managerToken}`)
      .set('idempotency-key', randomUUID())
      .send({
        teamId: team.id, userId: technician.id, acceptanceDurationMinutes:60, executionDurationMinutes:1440,
        title: `EvidÃªncia ${randomUUID()}`,
        description: 'Tarefa preparada para os testes de imagens protegidas',
        priority: 'NORMAL',
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const assigned = created;
    const accepted = await request(app)
      .post(`/api/v1/assignments/${assigned.body.data.task.cycle.assignment.id}/accept`)
      .set('authorization', `Bearer ${technicianToken}`)
      .set('idempotency-key', randomUUID())
      .send({ expectedVersion: assigned.body.data.task.cycle.version });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    return accepted.body.data.task;
  };
  const upload = (task, tokenValue, file = png, filename = 'evidencia.png') => request(app)
    .post(`/api/v1/tasks/${task.id}/images`)
    .set('authorization', `Bearer ${tokenValue}`)
    .set('idempotency-key', randomUUID())
    .field('expectedVersion', String(task.cycle.version))
    .attach('image', file, { filename, contentType: 'application/octet-stream' });

  before(async () => {
    prisma = await createPrismaClient(process.env.TEST_DATABASE_URL, { connectionLimit: 20 });
    storageRoot = await mkdtemp(path.join(os.tmpdir(), 'seaf-images-integration-'));
    storage = createFileImageStorage(storageRoot);
    app = createApp({ prisma, config, imageStorage: storage, passwordResetNotifier: async () => {} });
    roles = Object.fromEntries((await prisma.role.findMany()).map((role) => [role.code, role]));
    [manager, technician, other] = await Promise.all([
      user('MANAGER', 'Gestor Imagens'),
      user('TECHNICIAN', 'TÃ©cnico Imagens'),
      user('TECHNICIAN', 'TÃ©cnico Externo Imagens'),
    ]);
    team = await prisma.team.create({ data: { id: randomUUID(), name: `Equipe Imagens ${randomUUID()}` } });
    await Promise.all([
      prisma.teamManager.create({ data: { id: randomUUID(), teamId: team.id, userId: manager.id, assignedAt: new Date() } }),
      prisma.teamMember.create({ data: { id: randomUUID(), teamId: team.id, userId: technician.id, joinedAt: new Date() } }),
    ]);
    const calendar = await prisma.workCalendar.create({ data: { id: randomUUID(), teamId: team.id, timezone: 'America/Cuiaba' } });
    await prisma.team.update({ where: { id: team.id }, data: { calendarId: calendar.id } });
    const version = await prisma.calendarVersion.create({ data: { id: randomUUID(), calendarId: calendar.id, versionNumber: 1, effectiveFrom: new Date('2026-01-01'), publishedAt: new Date(), createdById: manager.id } });
    await prisma.workCalendar.update({ where: { id: calendar.id }, data: { activeVersionId: version.id } });
    [managerToken, technicianToken, otherToken] = await Promise.all([token(manager), token(technician), token(other)]);
  });

  after(async () => {
    await prisma?.$disconnect();
    if (storageRoot) {
      assert.equal(path.dirname(path.resolve(storageRoot)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(storageRoot).startsWith('seaf-images-integration-'));
      await rm(storageRoot, { recursive: true, force: true });
    }
  });

  it('envia, lista e recupera imagem vÃ¡lida sem expor a chave fÃ­sica', async () => {
    const task = await createTask();
    const sent = await upload(task, technicianToken);
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    assert.equal(sent.body.data.image.mimeType, 'image/png');
    assert.equal('storageKey' in sent.body.data.image, false);
    const listed = await request(app).get(`/api/v1/tasks/${task.id}/images`).set('authorization', `Bearer ${technicianToken}`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.images.length, 1);
    const content = await request(app).get(`/api/v1/images/${sent.body.data.image.id}/content`).set('authorization', `Bearer ${technicianToken}`);
    assert.equal(content.status, 200);
    assert.equal(content.headers['content-type'], 'image/png');
  });

  it('reutiliza o fluxo protegido em subtarefas', async () => {
    const parent = await createTask();
    const created = await request(app)
      .post(`/api/v1/tasks/${parent.id}/subtasks`)
      .set('authorization', `Bearer ${managerToken}`)
      .set('idempotency-key', randomUUID())
      .send({
        title: 'Subtarefa com evidÃªncia',
        description: 'ExecuÃ§Ã£o independente com imagem vinculada ao prÃ³prio ciclo',
        priority: 'NORMAL',
        userId: technician.id,
        deadlineAt: new Date(Date.now() + 43_200_000).toISOString(),
        expectedVersion: parent.cycle.version,
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const subtask = created.body.data.subtask;
    const accepted = await request(app)
      .post(`/api/v1/assignments/${subtask.cycle.assignment.id}/accept`)
      .set('authorization', `Bearer ${technicianToken}`)
      .set('idempotency-key', randomUUID())
      .send({ expectedVersion: subtask.cycle.version });
    assert.equal(accepted.status, 200);
    const sent = await upload(accepted.body.data.task, technicianToken);
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    assert.equal((await prisma.taskImage.findUnique({ where: { id: sent.body.data.image.id } })).cycleId, subtask.cycle.id);
  });

  it('rejeita assinatura divergente, extensÃ£o proibida e arquivo acima de 10 MB', async () => {
    const task = await createTask();
    assert.equal((await upload(task, technicianToken, png, 'falso.jpg')).status, 422);
    assert.equal((await upload(task, technicianToken, png, 'documento.pdf')).status, 422);
    assert.equal((await upload(task, technicianToken, Buffer.alloc(10 * 1024 * 1024 + 1), 'grande.png')).status, 413);
  });

  it('serializa onze uploads simultÃ¢neos e conserva no mÃ¡ximo dez ativos', async () => {
    const task = await createTask();
    const results = await Promise.all(Array.from({ length: 11 }, () => upload(task, technicianToken)));
    assert.equal(results.filter((result) => result.status === 201).length, 10);
    assert.equal(results.filter((result) => result.status === 422).length, 1);
    assert.equal(await prisma.taskImage.count({ where: { cycleId: task.cycle.id, deletedAt: null } }), 10);
  });

  it('nega acesso externo, upload alheio e remoÃ§Ã£o por outro autor', async () => {
    const task = await createTask();
    assert.equal((await upload(task, otherToken)).status, 404);
    const sent = await upload(task, technicianToken);
    const imageId = sent.body.data.image.id;
    assert.equal((await request(app).get(`/api/v1/images/${imageId}/content`).set('authorization', `Bearer ${otherToken}`)).status, 404);
    const denied = await request(app)
      .delete(`/api/v1/images/${imageId}`)
      .set('authorization', `Bearer ${managerToken}`)
      .set('idempotency-key', randomUUID())
      .send({ expectedVersion: task.cycle.version, reason: 'RemoÃ§Ã£o indevida por terceiro' });
    assert.equal(denied.status, 403);
  });

  it('faz remoÃ§Ã£o lÃ³gica auditada e mantÃ©m o arquivo fÃ­sico', async () => {
    const task = await createTask();
    const sent = await upload(task, technicianToken);
    const record = await prisma.taskImage.findUnique({ where: { id: sent.body.data.image.id } });
    const removed = await request(app)
      .delete(`/api/v1/images/${record.id}`)
      .set('authorization', `Bearer ${technicianToken}`)
      .set('idempotency-key', randomUUID())
      .send({ expectedVersion: task.cycle.version, reason: 'Imagem enviada em duplicidade' });
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.ok((await prisma.taskImage.findUnique({ where: { id: record.id } })).deletedAt);
    assert.ok(await prisma.auditEvent.findFirst({ where: { entityId: record.id, action: 'TASK_IMAGE_REMOVED' } }));
    await stat(path.join(storageRoot, record.storageKey));
    assert.equal((await request(app).get(`/api/v1/images/${record.id}/content`).set('authorization', `Bearer ${technicianToken}`)).status, 404);
  });

  it('preserva leitura histÃ³rica e bloqueia upload ou remoÃ§Ã£o em ciclo encerrado', async () => {
    const task = await createTask();
    const sent = await upload(task, technicianToken);
    const completed = await request(app)
      .post(`/api/v1/tasks/${task.id}/complete`)
      .set('authorization', `Bearer ${technicianToken}`)
      .set('idempotency-key', randomUUID())
      .send({ expectedVersion: task.cycle.version, completionText: 'Entrega concluÃ­da com evidÃªncia visual' });
    assert.equal(completed.status, 200);
    assert.equal((await request(app).get(`/api/v1/images/${sent.body.data.image.id}/content`).set('authorization', `Bearer ${technicianToken}`)).status, 200);
    assert.equal((await upload(completed.body.data.task, technicianToken)).status, 409);
    const removal = await request(app)
      .delete(`/api/v1/images/${sent.body.data.image.id}`)
      .set('authorization', `Bearer ${technicianToken}`)
      .set('idempotency-key', randomUUID())
      .send({ expectedVersion: completed.body.data.task.cycle.version, reason: 'Tentativa apÃ³s encerramento' });
    assert.equal(removal.status, 409);
  });

  it('compensa metadados quando a promoÃ§Ã£o do storage falha', async () => {
    const task = await createTask();
    const failingStorage = {
      ...storage,
      promote: async () => { throw new Error('falha simulada do storage'); },
    };
    const failingApp = createApp({ prisma, config, imageStorage: failingStorage, passwordResetNotifier: async () => {} });
    const failed = await request(failingApp)
      .post(`/api/v1/tasks/${task.id}/images`)
      .set('authorization', `Bearer ${technicianToken}`)
      .set('idempotency-key', randomUUID())
      .field('expectedVersion', String(task.cycle.version))
      .attach('image', png, { filename: 'falha.png' });
    assert.equal(failed.status, 500);
    assert.equal(await prisma.taskImage.count({ where: { cycleId: task.cycle.id } }), 0);
  });

  it('ignora nome manipulado e persiste somente chave interna segura', async () => {
    const task = await createTask();
    const sent = await upload(task, technicianToken, png, '../../fora.png');
    assert.equal(sent.status, 201);
    const record = await prisma.taskImage.findUnique({ where: { id: sent.body.data.image.id } });
    assert.equal(record.storageKey.includes('..'), false);
    assert.equal(record.storageKey.includes('fora'), false);
  });
});
