import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, describe, it } from 'node:test';
import request from 'supertest';
import { createIntegrationApp, testDatabase } from '../../testing/integration/context.js';
import { factories, fixtures, runningTaskInput } from '../../testing/integration/fixtures.js';

describe('RUNNING_CLOCK: persistência, transações e histórico sintético', { skip: process.env.RUN_DATABASE_INTEGRATION !== '1' }, () => {
  let prisma; let app; let data; const tokens = {};
  const call = (role, method, path, body, key = randomUUID()) => request(app)[method](`/api/v1${path}`).set('authorization', `Bearer ${tokens[role]}`).set('idempotency-key', key).send(body);
  const detail = async (id) => { const r = await call('manager', 'get', `/tasks/${id}`); assert.equal(r.status, 200); return r.body.data.task; };
  const create = async () => { const r = await call('manager', 'post', '/tasks', runningTaskInput(data.team.id, data.users.technician.id)); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.data.task; };
  const accept = async (task) => { const r = await call('technician', 'post', `/assignments/${task.cycle.assignment.id}/accept`, { expectedVersion: task.cycle.version }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.data.task; };
  const ask = async (task, type, extra = {}) => {
    const r = await call('technician', 'post', `/tasks/${task.id}/requests`, { type, reason: 'Solicitação sintética para validação dos prazos', expectedVersion: task.cycle.version, ...extra });
    assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.data.request;
  };
  before(async () => {
    ({ prisma } = await testDatabase()); data = await fixtures(prisma); app = createIntegrationApp({ prisma });
    for (const role of ['manager', 'technician', 'outsider']) {
      const r = await request(app).post('/api/v1/auth/login').send({ email: data.users[role].emailNormalized, password: data.password });
      assert.equal(r.status, 200); tokens[role] = r.body.data.accessToken;
    }
  });
  after(async () => prisma?.$disconnect());
  it('cria tarefa e única atribuição atomicamente e persiste prazo de aceite', async () => {
    const startedAt = Date.now(); const task = await create(); const finishedAt = Date.now();
    const cycle = await prisma.taskCycle.findUniqueOrThrow({ where: { id: task.cycle.id } });
    assert.equal(cycle.deadlinePolicy, 'RUNNING_CLOCK'); assert.equal(cycle.status, 'AWAITING_ACCEPTANCE');
    assert.ok(+cycle.acceptanceDeadlineAt >= startedAt + 60 * 60000 && +cycle.acceptanceDeadlineAt <= finishedAt + 60 * 60000); assert.equal(cycle.executionDeadlineAt, null);
    const assignments = await prisma.taskAssignment.findMany({ where: { cycleId: cycle.id } });
    assert.equal(assignments.length, 1); assert.equal(assignments[0].userId, data.users.technician.id);
    assert.equal(+assignments[0].acceptanceDeadlineAt, +cycle.acceptanceDeadlineAt);
    assert.equal(await prisma.auditEvent.count({ where: { entityId: task.id, action: 'TASK_CREATED_AND_ASSIGNED' } }), 1);
  });
  it('falha de anexo no fim da transação não deixa tarefa, ciclo ou atribuição parcial', async () => {
    const title = `Rollback ${randomUUID()}`;
    const r = await call('manager', 'post', '/tasks', runningTaskInput(data.team.id, data.users.technician.id, { title, initialAttachmentIds: [randomUUID()] }));
    assert.equal(r.status, 409); assert.equal(r.body.error.code, 'STAGED_UPLOAD_UNAVAILABLE');
    assert.equal(await prisma.taskCycle.count({ where: { title } }), 0);
    assert.equal(await prisma.task.count({ where: { teamId: data.team.id, currentCycleId: null } }), 0);
  });
  it('recusa criação sem responsável ou sem durações e responsável fora do escopo', async () => {
    const body = runningTaskInput(data.team.id, data.users.technician.id);
    for (const field of ['userId', 'acceptanceDurationMinutes', 'executionDurationMinutes']) {
      const invalid = { ...body }; delete invalid[field]; assert.equal((await call('manager', 'post', '/tasks', invalid)).status, 400);
    }
    const foreign = await fixtures(prisma);
    const invalid = { ...body, userId: foreign.users.technician.id };
    const r = await call('manager', 'post', '/tasks', invalid); assert.equal(r.status, 422);
  });
  it('aceite inicia execução a partir do aceite e preserva prazo de aceite', async () => {
    const waiting = await create(); const task = await accept(waiting);
    assert.equal(task.cycle.status, 'IN_PROGRESS'); assert.equal(task.cycle.acceptanceDeadlineAt, waiting.cycle.acceptanceDeadlineAt);
    const assignment = await prisma.taskAssignment.findUniqueOrThrow({ where: { id: task.cycle.assignment.id } });
    assert.equal(+new Date(task.cycle.executionDeadlineAt) - assignment.acceptedAt, 1440 * 60000);
    assert.equal(task.cycle.deadlineAt, task.cycle.executionDeadlineAt);
  });
  it('devolução aprovada encerra pausa, conserva tempo e permite nova atribuição', async () => {
    const task = await accept(await create()); const pending = await ask(task, 'RETURN');
    const start = new Date(Date.now() - 120000);
    await prisma.taskPauseInterval.updateMany({ where: { requestId: pending.id }, data: { startedAt: start } });
    const current = await detail(task.id);
    const r = await call('manager', 'post', `/requests/${pending.id}/approve`, { expectedVersion: current.cycle.version }); assert.equal(r.status, 200);
    const pause = await prisma.taskPauseInterval.findFirstOrThrow({ where: { requestId: pending.id } });
    const stored = await prisma.taskCycle.findUniqueOrThrow({ where: { id: task.cycle.id } });
    assert.ok(pause.endedAt); assert.equal(stored.status, 'PENDING');
    assert.equal(stored.executionDeadlineAt - new Date(task.cycle.executionDeadlineAt), pause.endedAt - start);
    const reassigned = await call('manager', 'post', `/tasks/${task.id}/assignments`, { userId: data.users.technician.id, expectedVersion: stored.version, acceptanceDurationMinutes: 120, executionDurationMinutes: 720 });
    assert.equal(reassigned.status, 200); assert.equal(reassigned.body.data.task.cycle.executionDeadlineAt, null);
  });
  it('devolução negada retoma execução sem encerrar atribuição', async () => {
    const task = await accept(await create()); const pending = await ask(task, 'RETURN'); const current = await detail(task.id);
    assert.equal((await call('manager', 'post', `/requests/${pending.id}/deny`, { expectedVersion: current.cycle.version, reason: 'Execução deve continuar com o responsável atual' })).status, 200);
    const updated = await detail(task.id); assert.equal(updated.cycle.status, 'IN_PROGRESS'); assert.equal(updated.cycle.assignment.id, task.cycle.assignment.id);
    assert.ok((await prisma.taskPauseInterval.findFirstOrThrow({ where: { requestId: pending.id } })).endedAt);
  });
  it('prorrogação aprovada persiste novo prazo e registra prazo anterior', async () => {
    const task = await accept(await create()); const proposed = new Date(+new Date(task.cycle.executionDeadlineAt) + 3600000).toISOString();
    const pending = await ask(task, 'EXTENSION', { proposedDeadlineAt: proposed }); const current = await detail(task.id);
    assert.equal((await call('manager', 'post', `/requests/${pending.id}/approve`, { expectedVersion: current.cycle.version })).status, 200);
    const updated = await detail(task.id); assert.equal(updated.cycle.executionDeadlineAt, proposed);
    const change = updated.cycles[0].deadlineChanges.find(c => c.kind === 'EXECUTION_EXTENSION'); assert.ok(change);
    assert.equal(new Date(change.oldDeadlineAt).toISOString(), task.cycle.executionDeadlineAt);
  });
  it('reatribuição concorrente mantém uma atribuição atual e rejeita versão obsoleta', async () => {
    const task = await create(); const input = { userId: data.users.technician.id, expectedVersion: task.cycle.version, acceptanceDurationMinutes: 120, executionDurationMinutes: 720, reason: 'Reatribuição concorrente controlada' };
    const results = await Promise.all([call('manager', 'post', `/tasks/${task.id}/assignments`, input), call('manager', 'post', `/tasks/${task.id}/assignments`, input)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    assert.equal(await prisma.taskAssignment.count({ where: { cycleId: task.cycle.id, endedAt: null } }), 1);
  });
  it('replay de criação conserva registro e atribuição sem duplicar', async () => {
    const input = runningTaskInput(data.team.id, data.users.technician.id); const key = randomUUID();
    const first = await call('manager', 'post', '/tasks', input, key); const second = await call('manager', 'post', '/tasks', input, key);
    assert.equal(first.status, 201); assert.equal(second.status, 201); assert.equal(second.headers['idempotency-replayed'], 'true');
    assert.equal(second.body.data.task.id, first.body.data.task.id);
    assert.equal(await prisma.taskAssignment.count({ where: { cycleId: first.body.data.task.cycle.id } }), 1);
  });
  it('reabertura preserva ciclo RUNNING_CLOCK encerrado e não reutiliza atribuição', async () => {
    const task = await accept(await create());
    const completed = await call('technician', 'post', `/tasks/${task.id}/complete`, { expectedVersion: task.cycle.version, completionText: 'Entrega sintética concluída e validada' }); assert.equal(completed.status, 200);
    const before = await prisma.taskCycle.findUniqueOrThrow({ where: { id: task.cycle.id } });
    const reopened = await call('manager', 'post', `/tasks/${task.id}/reopen`, { expectedVersion: completed.body.data.task.cycle.version, reason: 'Novo ciclo solicitado para validação de histórico' }); assert.equal(reopened.status, 200);
    assert.equal(reopened.body.data.task.cycle.cycleNumber, 2); assert.equal(reopened.body.data.task.cycle.status, 'PENDING'); assert.equal(reopened.body.data.task.cycle.assignment, null);
    assert.deepEqual(await prisma.taskCycle.findUniqueOrThrow({ where: { id: task.cycle.id } }), before);
  });
  it('fixture LEGACY_CALENDAR preserva prazo absoluto e calendário histórico', async () => {
    const deadlineAt = new Date(Date.now() + 86400000); const f = factories(prisma);
    const task = await f.legacyTask({ teamId: data.team.id, authorId: data.users.manager.id, deadlineAt });
    await f.assignment(task.cycle.id, data.users.technician.id, data.users.manager.id, { calendarVersionId: data.version.id });
    await prisma.taskCycle.update({ where: { id: task.cycle.id }, data: { status: 'AWAITING_ACCEPTANCE' } });
    const accepted = await accept(await detail(task.id));
    assert.equal(accepted.cycle.deadlinePolicy, 'LEGACY_CALENDAR'); assert.equal(+new Date(accepted.cycle.deadlineAt), +deadlineAt);
    assert.equal((await prisma.taskAssignment.findUniqueOrThrow({ where: { id: accepted.cycle.assignment.id } })).calendarVersionId, data.version.id);
  });
});
