import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, describe, it } from 'node:test';
import request from 'supertest';
import { createIntegrationApp as createApp } from '../../testing/integration/context.js';
import { fixtures, factories, runningTaskInput } from '../../testing/integration/fixtures.js';
import { createOutboxService } from '../../src/modules/outbox/outbox.service.js';
import { testDatabase } from '../../testing/integration/context.js';

describe('Kanban unificado - escopo pessoal e filtros no MariaDB', { skip: process.env.RUN_DATABASE_INTEGRATION !== '1' }, () => {
  let prisma; let app; let data; let foreign; const tokens = {}; const tasks = {};
  const call = (role, method, path, body) => request(app)[method](`/api/v1${path}`).set('authorization', `Bearer ${tokens[role]}`).set('idempotency-key', randomUUID()).send(body);
  async function create(role, teamId, title, assignee, priority = 'NORMAL', overdue = false) {
    const reason = 'Preparação isolada do Kanban para homologação';
    if (!assignee) return factories(prisma).legacyTask({ teamId, authorId: data.users[role].id, title: title + ' ' + data.run, priority });
    const result = await call(role, 'post', '/tasks', runningTaskInput(teamId, assignee.id, { title: title + ' ' + data.run, priority, reason }));
    assert.equal(result.status, 201, JSON.stringify(result.body));
    let task = result.body.data.task;
    if (overdue) {
      const past = new Date('2020-01-01T12:00:00Z');
      await prisma.taskCycle.update({ where: { id: task.cycle.id }, data: { acceptanceDeadlineAt: past } });
      await prisma.taskAssignment.update({ where: { id: task.cycle.assignment.id }, data: { acceptanceDeadlineAt: past } });
      task = (await call(role, 'get', '/tasks/' + task.id)).body.data.task;
    }
    return task;
  }
  before(async () => {
    ({ prisma } = await testDatabase()); data = await fixtures(prisma); foreign = await fixtures(prisma);
    app = createApp({ prisma, config: { loginMaxAttempts: 1000 } });
    for (const role of ['secretary', 'manager', 'technician', 'admin']) {
      const response = await request(app).post('/api/v1/auth/login').send({ email: data.users[role].emailNormalized, password: data.password });
      assert.equal(response.status, 200); tokens[role] = response.body.data.accessToken;
    }
    tasks.pending = await create('manager', data.team.id, 'Pendente');
    tasks.waiting = await create('manager', data.team.id, 'Aceite urgente', data.users.technician, 'HIGH', true);
    tasks.progress = await create('manager', data.team.id, 'Execução', data.users.technician);
    let result = await call('technician', 'post', `/assignments/${tasks.progress.cycle.assignment.id}/accept`, { expectedVersion: tasks.progress.cycle.version });
    assert.equal(result.status, 200); tasks.progress = result.body.data.task;
    tasks.completed = await create('manager', data.team.id, 'Entrega', data.users.technician);
    result = await call('technician', 'post', `/assignments/${tasks.completed.cycle.assignment.id}/accept`, { expectedVersion: tasks.completed.cycle.version });
    assert.equal(result.status, 200);
    result = await call('technician', 'post', `/tasks/${tasks.completed.id}/complete`, { expectedVersion: result.body.data.task.cycle.version, completionText: 'Entrega concluída no cenário isolado' });
    assert.equal(result.status, 200); tasks.completed = result.body.data.task;
    tasks.manager = await create('manager', data.team.id, 'Gestor pessoal', data.users.manager);
    tasks.secretary = await create('secretary', data.team.id, 'Secretário pessoal', data.users.secretary);
    tasks.admin = await create('admin', data.team.id, 'Admin pessoal', data.users.admin);
    tasks.foreign = await create('secretary', foreign.team.id, 'Outra equipe');
  });
  after(async () => { await prisma?.$disconnect(); });
  it('Secretário e Gestor consultam equipes no escopo e a coluna pessoal referencia a mesma tarefa', async () => {
    for (const role of ['secretary', 'manager']) {
      const board = await call(role, 'get', `/kanban?search=${data.run}&pageSize=100`);
      assert.equal(board.status, 200);
      assert.equal(board.body.data.tasks.some((task) => task.id === tasks.foreign.id), role === 'secretary');
      const mine = await call(role, 'get', `/my-tasks?search=${data.run}&pageSize=100`);
      assert.equal(mine.status, 200);
      assert.deepEqual(mine.body.data.tasks.map((task) => task.id), [tasks[role].id]);
      assert.ok(board.body.data.tasks.some((task) => task.id === tasks[role].id));
    }
  });
  it('Técnico vê somente atribuições próprias e entregas; ADMIN pessoal não recebe tarefas gerenciais', async () => {
    const mine = await call('technician', 'get', `/my-tasks?search=${data.run}&pageSize=100`);
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.data.tasks.map((task) => task.id).sort(), [tasks.waiting.id, tasks.progress.id, tasks.completed.id].sort());
    assert.equal((await call('technician', 'get', '/kanban')).status, 403);
    assert.equal((await call('technician', 'get', `/tasks/${tasks.pending.id}`)).status, 404);
    const admin = await call('admin', 'get', `/my-tasks?search=${data.run}&pageSize=100`);
    assert.deepEqual(admin.body.data.tasks.map((task) => task.id), [tasks.admin.id]);
    assert.equal((await call('admin', 'get', '/dashboard')).status, 403);
    assert.equal((await call('technician', 'post', '/tasks', {})).status, 403);
  });
  it('busca, equipe, responsável, prioridade, status e prazo combinam sem substituir restrições', async () => {
    const filters = new URLSearchParams({ search: data.run, teamId: data.team.id, responsibleId: data.users.technician.id, priority: 'HIGH', status: 'AWAITING_ACCEPTANCE', overdue: 'true', deadlineTo: '2027-01-01T23:59:59.999Z' });
    const response = await call('manager', 'get', `/kanban?${filters}`);
    assert.equal(response.status, 200); assert.deepEqual(response.body.data.tasks.map((task) => task.id), [tasks.waiting.id]);
    filters.set('status', 'IN_PROGRESS');
    assert.equal((await call('manager', 'get', `/kanban?${filters}`)).body.meta.total, 0);
    assert.equal((await call('technician', 'get', `/my-tasks?status=COMPLETED&overdue=true`)).body.meta.total, 0);
    assert.equal((await call('manager', 'get', `/kanban?status=COMPLETED`)).body.meta.total, 0);
    assert.equal((await call('manager', 'get', `/my-tasks?responsibleId=${data.users.technician.id}`)).body.meta.total, 0);
  });
  it('rejeição/reatribuição não permitem recuperar tarefa alheia por filtros ou IDOR', async () => {
    let task = await create('manager', data.team.id, 'Reatribuição', data.users.technician);
    const response = await call('manager', 'post', `/tasks/${task.id}/assignments`, { userId: data.users.manager.id, expectedVersion: task.cycle.version, acceptanceDurationMinutes:60, executionDurationMinutes:1440, reason: 'Reatribuição para verificar escopo atual' });
    assert.equal(response.status, 200); task = response.body.data.task;
    assert.equal((await call('technician', 'get', `/tasks?search=${task.publicNumber}&responsibleId=${data.users.technician.id}`)).body.meta.total, 0);
    assert.equal((await call('technician', 'get', `/my-tasks?search=${task.publicNumber}&responsibleId=${data.users.manager.id}`)).body.meta.total, 0);
    assert.equal((await call('technician', 'get', `/tasks/${task.id}`)).status, 404);
    assert.equal((await call('manager', 'get', `/my-tasks?search=${task.publicNumber}`)).body.meta.total, 1);
  });
  it('leituras repetidas não duplicam tarefas, ciclos nem auditoria', async () => {
    const ids = Object.values(tasks).map((task) => task.id);
    const count = async () => Promise.all([prisma.task.count({ where: { id: { in: ids } } }), prisma.taskCycle.count({ where: { taskId: { in: ids } } }), prisma.auditEvent.count({ where: { actorId: data.users.manager.id } })]);
    const before = await count();
    for (let i = 0; i < 3; i++) for (const path of ['/kanban', '/my-tasks']) assert.equal((await call('manager', 'get', path)).status, 200);
    assert.deepEqual(await count(), before);
  });
  it('eventos reais de atribuição, aceite e rejeição podem produzir notificações idempotentes', async () => {
    let task = await create('manager', data.team.id, 'Notificação de aceite', data.users.technician);
    const assignmentId = task.cycle.assignment.id;
    const accepted = await call('technician', 'post', `/assignments/${assignmentId}/accept`, { expectedVersion: task.cycle.version });
    assert.equal(accepted.status, 200);
    const rejectedTask = await create('manager', data.team.id, 'Notificação de rejeição', data.users.technician);
    const rejected = await call('technician', 'post', `/assignments/${rejectedTask.cycle.assignment.id}/reject`, { expectedVersion: rejectedTask.cycle.version, reason: 'Rejeição documentada para validar o evento' });
    assert.equal(rejected.status, 200);
    const events = await prisma.outboxEvent.findMany({ where: { eventType: { in: ['TASK_ASSIGNED', 'ASSIGNMENT_ACCEPTED', 'ASSIGNMENT_REJECTED'] }, OR: [{ payloadJson: { path: '$.taskId', equals: task.id } }, { payloadJson: { path: '$.taskId', equals: rejectedTask.id } }] } });
    assert.equal(events.length, 4);
    const service = createOutboxService({ emailSender: { testMode: true, send: async () => ({ status: 'SENT', sentAt: null }) } });
    for (const event of events) {
      assert.ok(event.payloadJson.assignmentId);
      await service.processEvent(prisma, event); await service.processEvent(prisma, event);
    }
    assert.equal(await prisma.notification.count({ where: { userId: data.users.technician.id, entityId: { in: [task.id, rejectedTask.id] } } }), 4);
  });
});
