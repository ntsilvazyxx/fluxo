import { factories } from '../../testing/integration/fixtures.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { createIntegrationApp as createApp } from '../../testing/integration/context.js';
import { createIntegrationPrisma as createPrismaClient } from '../../testing/integration/context.js';
import { hashPassword } from '../../src/shared/security/password.js';

const suite = process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip;
const password = 'Senha-Forte-2026';
const config = {
  corsOrigins: ['http://localhost:5173'], jwtAccessSecret: 'integration-secret-at-least-thirty-two-characters',
  accessTokenTtlSeconds: 900, refreshTokenTtlDays: 1, passwordResetTtlMinutes: 30,
  loginWindowMinutes: 15, loginMaxAttempts: 100, cookieSecure: false,
};

suite('subtarefas, ciclos, reabertura e restauração no MariaDB real', () => {
  let prisma, app, roles, manager, outsider, technician, team, foreignTeam;
  let managerToken, outsiderToken, technicianToken;

  const makeUser = async (role, name) => prisma.user.create({
    data: {
      id: randomUUID(), name, emailNormalized: `${randomUUID()}@fase5.test`,
      passwordHash: await hashPassword(password), roleId: roles[role].id,
    },
  });
  const login = async (user) => (await request(app).post('/api/v1/auth/login').send({ email: user.emailNormalized, password })).body.data.accessToken;
  const headers = (token, key = randomUUID()) => ({ authorization: `Bearer ${token}`, 'idempotency-key': key });
  const detail = async (id, token = managerToken) => {
    const response = await request(app).get(`/api/v1/tasks/${id}`).set('authorization', `Bearer ${token}`);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body.data.task;
  };
  const createMain = async ({ start = false } = {}) => {
    let task = await factories(prisma).legacyTask({ teamId: team.id, authorId: manager.id, title: `Histórico ${randomUUID()}`, priority: 'HIGH', deadlineAt: new Date(Date.now() + 4 * 86400000) });
    if (!start) return task;
    const assigned = await request(app).post(`/api/v1/tasks/${task.id}/assignments`).set(headers(managerToken)).send({
      userId: technician.id, acceptanceDurationMinutes:60, executionDurationMinutes:1440, expectedVersion: task.cycle.version,
    });
    assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
    task = assigned.body.data.task;
    const accepted = await request(app).post(`/api/v1/assignments/${task.cycle.assignment.id}/accept`).set(headers(technicianToken)).send({ expectedVersion: task.cycle.version });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    return accepted.body.data.task;
  };
  const createSubtask = async (parent, key = randomUUID()) => request(app)
    .post(`/api/v1/tasks/${parent.id}/subtasks`).set(headers(managerToken, key)).send({
      title: `Subtarefa ${randomUUID()}`, description: 'Execução independente vinculada ao ciclo principal',
      priority: 'NORMAL', userId: technician.id,
      deadlineAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), expectedVersion: parent.cycle.version,
    });

  before(async () => {
    prisma = await createPrismaClient(process.env.TEST_DATABASE_URL, { connectionLimit: 20 });
    roles = Object.fromEntries((await prisma.role.findMany()).map((role) => [role.code, role]));
    [manager, outsider, technician] = await Promise.all([
      makeUser('MANAGER', 'Gestor Subtarefas'), makeUser('MANAGER', 'Gestor Externo Fase 5'), makeUser('TECHNICIAN', 'Técnico Subtarefas'),
    ]);
    [team, foreignTeam] = await Promise.all([
      prisma.team.create({ data: { id: randomUUID(), name: `Equipe Fase 5 ${randomUUID()}` } }),
      prisma.team.create({ data: { id: randomUUID(), name: `Equipe Externa Fase 5 ${randomUUID()}` } }),
    ]);
    await Promise.all([
      prisma.teamManager.create({ data: { id: randomUUID(), teamId: team.id, userId: manager.id, assignedAt: new Date() } }),
      prisma.teamManager.create({ data: { id: randomUUID(), teamId: foreignTeam.id, userId: outsider.id, assignedAt: new Date() } }),
      prisma.teamMember.create({ data: { id: randomUUID(), teamId: team.id, userId: technician.id, joinedAt: new Date() } }),
    ]);
    const calendar = await prisma.workCalendar.create({ data: { id: randomUUID(), teamId: team.id, timezone: 'America/Cuiaba' } });
    await prisma.team.update({ where: { id: team.id }, data: { calendarId: calendar.id } });
    const calendarVersion = await prisma.calendarVersion.create({
      data: { id: randomUUID(), calendarId: calendar.id, versionNumber: 1, effectiveFrom: new Date('2026-01-01'), publishedAt: new Date(), createdById: manager.id },
    });
    await prisma.workCalendar.update({ where: { id: calendar.id }, data: { activeVersionId: calendarVersion.id } });
    app = createApp({ prisma, config, passwordResetNotifier: async () => {} });
    [managerToken, outsiderToken, technicianToken] = await Promise.all([login(manager), login(outsider), login(technician)]);
  });

  after(async () => prisma.$disconnect());

  it('cria subtarefa atribuída e reutiliza aceite e conclusão', async () => {
    const parent = await createMain();
    const created = await createSubtask(parent);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    let subtask = created.body.data.subtask;
    assert.equal(subtask.parentCycleId, parent.cycle.id);
    assert.equal(subtask.cycle.status, 'AWAITING_ACCEPTANCE');
    const accepted = await request(app).post(`/api/v1/assignments/${subtask.cycle.assignment.id}/accept`).set(headers(technicianToken)).send({ expectedVersion: 0 });
    assert.equal(accepted.status, 200);
    subtask = accepted.body.data.task;
    const completed = await request(app).post(`/api/v1/tasks/${subtask.id}/complete`).set(headers(technicianToken)).send({ expectedVersion: subtask.cycle.version, completionText: 'Resultado completo da subtarefa entregue' });
    assert.equal(completed.status, 200);
    assert.equal(completed.body.data.task.cycle.status, 'COMPLETED');
  });

  it('bloqueia subtarefa de segundo nível', async () => {
    const parent = await createMain();
    const subtask = (await createSubtask(parent)).body.data.subtask;
    const nested = await request(app).post(`/api/v1/tasks/${subtask.id}/subtasks`).set(headers(managerToken)).send({
      title: 'Segundo nível proibido', description: 'Esta operação deve ser recusada pelo serviço', priority: 'NORMAL',
      userId: technician.id, deadlineAt: new Date(Date.now() + 86_400_000).toISOString(), expectedVersion: subtask.cycle.version,
    });
    assert.equal(nested.status, 422);
    assert.equal(nested.body.error.code, 'NESTED_SUBTASK_NOT_ALLOWED');
  });

  it('bloqueia conclusão da principal enquanto há subtarefa ativa', async () => {
    let parent = await createMain({ start: true });
    assert.equal((await createSubtask(parent)).status, 201);
    parent = await detail(parent.id);
    const completed = await request(app).post(`/api/v1/tasks/${parent.id}/complete`).set(headers(technicianToken)).send({
      expectedVersion: parent.cycle.version, completionText: 'Tentativa de concluir com subtarefa ainda aberta',
    });
    assert.equal(completed.status, 422);
    assert.equal(completed.body.error.code, 'OPEN_SUBTASKS');
  });

  it('mantém consistência no cancelamento simultâneo da principal e subtarefa', async () => {
    let parent = await createMain({ start: true });
    const subtask = (await createSubtask(parent)).body.data.subtask;
    parent = await detail(parent.id);
    const parentCancel = request(app).post(`/api/v1/tasks/${parent.id}/cancel`).set(headers(managerToken)).send({ expectedVersion: parent.cycle.version, reason: 'Cancelamento atômico da execução principal' });
    const childCancel = request(app).post(`/api/v1/tasks/${subtask.id}/cancel`).set(headers(managerToken)).send({ expectedVersion: subtask.cycle.version, reason: 'Cancelamento concorrente da subtarefa vinculada' });
    const results = await Promise.all([parentCancel, childCancel]);
    assert.equal(results[0].status, 200, JSON.stringify(results[0].body));
    assert.ok([200, 409].includes(results[1].status));
    assert.equal((await detail(parent.id)).cycle.status, 'CANCELLED');
    assert.equal((await detail(subtask.id)).cycle.status, 'CANCELLED');
  });

  it('serializa reabertura, cria um único ciclo e preserva o anterior', async () => {
    let task = await createMain({ start: true });
    const completed = await request(app).post(`/api/v1/tasks/${task.id}/complete`).set(headers(technicianToken)).send({ expectedVersion: task.cycle.version, completionText: 'Entrega concluída antes da reabertura controlada' });
    assert.equal(completed.status, 200);
    task = completed.body.data.task;
    const payload = { expectedVersion: task.cycle.version, reason: 'Nova execução necessária após revisão institucional' };
    const make = () => request(app).post(`/api/v1/tasks/${task.id}/reopen`).set(headers(managerToken)).send(payload);
    const results = await Promise.all([make(), make()]);
    assert.deepEqual(results.map((item) => item.status).sort(), [200, 409]);
    const updated = await detail(task.id);
    assert.equal(updated.cycle.cycleNumber, 2);
    assert.equal(updated.cycle.status, 'PENDING');
    assert.equal(updated.cycle.deadlineAt, null);
    assert.equal(updated.cycle.assignment, null);
    assert.equal(updated.cycles.length, 2);
    assert.equal(updated.cycles[0].status, 'COMPLETED');
    await assert.rejects(() => prisma.taskCycle.update({ where: { id: updated.cycles[0].id }, data: { title: 'Alteração proibida' } }));
  });

  it('restaura tarefa cancelada sem reutilizar atribuição', async () => {
    let task = await createMain({ start: true });
    const cancelled = await request(app).post(`/api/v1/tasks/${task.id}/cancel`).set(headers(managerToken)).send({ expectedVersion: task.cycle.version, reason: 'Cancelamento para validar restauração posterior' });
    assert.equal(cancelled.status, 200);
    task = cancelled.body.data.task;
    const restored = await request(app).post(`/api/v1/tasks/${task.id}/restore`).set(headers(managerToken)).send({ expectedVersion: task.cycle.version, reason: 'Demanda institucional restabelecida formalmente' });
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    assert.equal(restored.body.data.task.cycle.cycleNumber, 2);
    assert.equal(restored.body.data.task.cycle.status, 'PENDING');
    assert.equal(restored.body.data.task.cycle.assignment, null);
  });

  it('não reabre automaticamente subtarefas do ciclo anterior', async () => {
    let parent = await createMain({ start: true });
    let subtask = (await createSubtask(parent)).body.data.subtask;
    subtask = (await request(app).post(`/api/v1/assignments/${subtask.cycle.assignment.id}/accept`).set(headers(technicianToken)).send({ expectedVersion: subtask.cycle.version })).body.data.task;
    assert.equal((await request(app).post(`/api/v1/tasks/${subtask.id}/complete`).set(headers(technicianToken)).send({ expectedVersion: subtask.cycle.version, completionText: 'Subtarefa encerrada no ciclo original' })).status, 200);
    parent = await detail(parent.id);
    const completed = await request(app).post(`/api/v1/tasks/${parent.id}/complete`).set(headers(technicianToken)).send({ expectedVersion: parent.cycle.version, completionText: 'Principal concluída com subtarefa encerrada' });
    assert.equal(completed.status, 200);
    parent = completed.body.data.task;
    assert.equal((await request(app).post(`/api/v1/tasks/${parent.id}/reopen`).set(headers(managerToken)).send({ expectedVersion: parent.cycle.version, reason: 'Novo ciclo sem reativar subtarefas históricas' })).status, 200);
    const currentSubtasks = await request(app).get(`/api/v1/tasks/${parent.id}/subtasks`).set('authorization', `Bearer ${managerToken}`);
    assert.equal(currentSubtasks.status, 200);
    assert.equal(currentSubtasks.body.data.subtasks.length, 0);
    assert.equal((await detail(subtask.id)).cycle.status, 'COMPLETED');
  });

  it('isola subtarefas entre equipes e bloqueia manipulação de IDs', async () => {
    const parent = await createMain();
    const subtask = (await createSubtask(parent)).body.data.subtask;
    assert.equal((await request(app).get(`/api/v1/tasks/${subtask.id}`).set('authorization', `Bearer ${outsiderToken}`)).status, 404);
    assert.equal((await request(app).get(`/api/v1/tasks/${parent.id}/subtasks`).set('authorization', `Bearer ${outsiderToken}`)).status, 404);
    const tampered = await request(app).post(`/api/v1/tasks/${parent.id}/subtasks`).set(headers(outsiderToken)).send({
      title: 'Subtarefa indevida', description: 'Tentativa fora da equipe autorizada', priority: 'LOW', userId: technician.id,
      deadlineAt: new Date(Date.now() + 86_400_000).toISOString(), expectedVersion: 1,
    });
    assert.equal(tampered.status, 404);
  });

  it('reutiliza devolução e prorrogação na subtarefa', async () => {
    const parent = await createMain();
    let subtask = (await createSubtask(parent)).body.data.subtask;
    subtask = (await request(app).post(`/api/v1/assignments/${subtask.cycle.assignment.id}/accept`).set(headers(technicianToken)).send({ expectedVersion: 0 })).body.data.task;
    const extension = await request(app).post(`/api/v1/tasks/${subtask.id}/requests`).set(headers(technicianToken)).send({
      type: 'EXTENSION', reason: 'Necessidade de prazo adicional para concluir a subtarefa',
      proposedDeadlineAt: new Date(Date.now() + 6 * 86_400_000).toISOString(), expectedVersion: subtask.cycle.version,
    });
    assert.equal(extension.status, 201);
    subtask = await detail(subtask.id);
    assert.equal((await request(app).post(`/api/v1/requests/${extension.body.data.request.id}/approve`).set(headers(managerToken)).send({ expectedVersion: subtask.cycle.version })).status, 200);
    subtask = await detail(subtask.id);
    const returned = await request(app).post(`/api/v1/tasks/${subtask.id}/requests`).set(headers(technicianToken)).send({
      type: 'RETURN', reason: 'Impedimento temporário documentado na subtarefa', expectedVersion: subtask.cycle.version,
    });
    assert.equal(returned.status, 201);
    subtask = await detail(subtask.id);
    assert.equal((await request(app).post(`/api/v1/requests/${returned.body.data.request.id}/deny`).set(headers(managerToken)).send({ expectedVersion: subtask.cycle.version, reason: 'A subtarefa deve permanecer com o responsável atual' })).status, 200);
    assert.equal((await detail(subtask.id)).cycle.status, 'IN_PROGRESS');
  });

  it('mantém criação de subtarefa idempotente', async () => {
    const parent = await createMain();
    const key = randomUUID();
    const payload = {
      title: 'Subtarefa idempotente', description: 'O mesmo payload deve produzir a mesma subtarefa',
      priority: 'NORMAL', userId: technician.id,
      deadlineAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), expectedVersion: parent.cycle.version,
    };
    const make = () => request(app).post(`/api/v1/tasks/${parent.id}/subtasks`).set(headers(managerToken, key)).send(payload);
    const first = await make();
    const second = await make();
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(second.headers['idempotency-replayed'], 'true');
    assert.equal(first.body.data.subtask.id, second.body.data.subtask.id);
    assert.equal(await prisma.task.count({ where: { parentCycleId: parent.cycle.id } }), 1);
  });
});
