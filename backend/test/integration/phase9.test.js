import assert from 'node:assert/strict';
import { before, after, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { testDatabase, checkDatabase } from '../../../quality/test-database.js';
import { fixtures } from '../../../quality/fixtures.js';

describe('Fase 9 - ataques de entrada e autenticação no MariaDB real', { skip: process.env.RUN_DATABASE_INTEGRATION !== '1' }, () => {
  let prisma; let app; let data; let token;
  before(async () => {
    ({ prisma } = testDatabase()); await checkDatabase(prisma); data = await fixtures(prisma);
    app = createApp({ prisma, startOutboxWorker: false });
    const login = await request(app).post('/api/v1/auth/login').send({ email: data.users.manager.emailNormalized, password: data.password });
    assert.equal(login.status, 200); token = login.body.data.accessToken;
  });
  after(async () => { await prisma?.$disconnect(); });
  it('trata SQL injection de pesquisa como texto sem ampliar o escopo', async () => {
    for (const search of ["' OR 1=1 --", "'; DROP TABLE users; --", '<script>alert(1)</script>']) {
      const response = await request(app).get('/api/v1/reports').query({ search }).set('authorization', `Bearer ${token}`);
      assert.equal(response.status, 200); assert.equal(response.body.data.meta.total, 0);
    }
    assert.ok(await prisma.user.count({ where: { id: data.users.manager.id } }));
  });
  it('nega token adulterado e não expõe hash ou refresh na resposta de login', async () => {
    const [header, payload, signature] = token.split('.');
    const forged = `${header}.${payload}.${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
    assert.equal((await request(app).get('/api/v1/users').set('authorization', `Bearer ${forged}`)).status, 401);
    const result = await request(app).post('/api/v1/auth/login').send({ email: data.users.technician.emailNormalized, password: data.password });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.refreshToken, undefined);
    assert.equal(result.body.data.user.passwordHash, undefined);
    assert.match(result.headers['set-cookie'][0], /HttpOnly/);
    assert.match(result.headers['set-cookie'][0], /SameSite=Strict/);
  });
  it('nega ampliação de escopo por equipe e rejeita paginação/ordenação inválidas', async () => {
    const team = await prisma.team.create({ data: { id: randomUUID(), name: `Externa QA9 ${randomUUID()}` } });
    const response = await request(app).get('/api/v1/dashboard').query({ teamId: team.id }).set('authorization', `Bearer ${token}`);
    assert.equal(response.status, 200); assert.equal(response.body.data.cards.totalCurrentTasks, 0);
    for (const query of [{ pageSize: 1000000 }, { sortBy: 'passwordHash' }, { page: -1 }, { periodStart: 'invalid' }]) {
      assert.equal((await request(app).get('/api/v1/reports').query(query).set('authorization', `Bearer ${token}`)).status, 400);
    }
  });
  for (const type of ['EXTENSION', 'RETURN']) {
    it(`conclusão com ${type} pendente respeita o SDD e preserva atomicidade`, async () => {
      const call = async (method, path, body, accessToken = token, key = randomUUID()) => request(app)[method](`/api/v1${path}`).set('authorization', `Bearer ${accessToken}`).set('idempotency-key', key).send(body);
      const login = await request(app).post('/api/v1/auth/login').send({ email: data.users.technician.emailNormalized, password: data.password });
      assert.equal(login.status, 200); const techToken = login.body.data.accessToken;
      const created = await call('post', '/tasks', { teamId: data.team.id, title: `Conclusão ${type}`, description: 'Regressão de conclusão e pedido pendente' });
      assert.equal(created.status, 201); const id = created.body.data.task.id;
      assert.equal((await call('post', `/tasks/${id}/assignments`, { userId: data.users.technician.id, deadlineAt: '2027-01-05T12:00:00Z', expectedVersion: 0 })).status, 200);
      const task = (await call('get', `/tasks/${id}`)).body.data.task;
      assert.equal((await call('post', `/assignments/${task.cycle.assignment.id}/accept`, { expectedVersion: task.cycle.version }, techToken)).status, 200);
      const accepted = (await call('get', `/tasks/${id}`)).body.data.task;
      const pending = await call('post', `/tasks/${id}/requests`, { type, reason: 'Pedido pendente de homologação', expectedVersion: accepted.cycle.version, ...(type === 'EXTENSION' ? { proposedDeadlineAt: '2027-02-05T12:00:00Z' } : {}) }, techToken);
      assert.equal(pending.status, 201);
      const current = (await call('get', `/tasks/${id}`)).body.data.task;
      const key = randomUUID(); const payload = { expectedVersion: current.cycle.version, completionText: 'Entrega completa com verificação de atomicidade' };
      const completed = await call('post', `/tasks/${id}/complete`, payload, techToken, key);
      assert.equal(completed.status, type === 'EXTENSION' ? 200 : 409);
      const stored = await prisma.taskRequest.findUniqueOrThrow({ where: { id: pending.body.data.request.id }, include: { pauseIntervals: true } });
      assert.equal(stored.status, type === 'EXTENSION' ? 'CLOSED_BY_COMPLETION' : 'PENDING');
      if (type === 'EXTENSION') {
        const replay = await call('post', `/tasks/${id}/complete`, payload, techToken, key);
        assert.equal(replay.status, 200); assert.equal(replay.headers['idempotency-replayed'], 'true');
        assert.equal(await prisma.auditEvent.count({ where: { entityId: current.cycle.id, action: 'TASK_COMPLETED' } }), 1);
        const events = await prisma.outboxEvent.findMany({ where: { eventType: 'TASK_COMPLETED' } });
        assert.equal(events.filter((e) => e.payloadJson.taskId === id).length, 1);
      } else {
        assert.equal(stored.pauseIntervals.length, 1); assert.equal(stored.pauseIntervals[0].endedAt, null);
        const stillActive = await prisma.taskCycle.findUniqueOrThrow({ where: { id: current.cycle.id } });
        assert.equal(stillActive.status, 'IN_PROGRESS'); assert.equal(stillActive.closedAt, null);
      }
    });
  }
});
