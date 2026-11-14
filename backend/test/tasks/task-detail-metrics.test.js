import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createTaskService } from '../../src/modules/tasks/task.service.js';
import { signAccessToken } from '../../src/shared/security/tokens.js';

const at = (date) => new Date(date);
const hour = 3600000;
const id = '00000000-0000-4000-8000-000000000001';
function assignment(overrides = {}) {
  return { id: 'assignment', userId: 'user', user: { id: 'user', name: 'Usuário sintético' },
    assignedAt: at('2026-01-01T00:00:00Z'), acceptedAt: at('2026-01-01T01:00:00Z'), endedAt: null,
    calendarVersionId: null, calendarVersion: null, pauseIntervals: [{ startedAt: at('2026-01-01T02:00:00Z'), endedAt: null }], ...overrides };
}
function cycle(overrides = {}) {
  return { id: 'cycle', cycleNumber: 1, status: 'IN_PROGRESS', title: 'Tarefa sintética', deadlinePolicy: 'RUNNING_CLOCK',
    acceptanceDurationMinutes: 60, executionDurationMinutes: 1440, acceptanceDeadlineAt: at('2026-01-01T01:00:00Z'),
    executionDeadlineAt: at('2026-01-02T01:00:00Z'), deadlineAt: null, version: 1,
    openedAt: at('2026-01-01T00:00:00Z'), closedAt: null, assignments: [assignment()], requests: [], deadlineChanges: [], notes: [], ...overrides };
}
function task(cycles = [cycle()]) {
  return { id, publicNumber: 1n, parentCycleId: null, team: { id: 'team', name: 'Equipe sintética' }, currentCycle: cycles.at(-1), cycles };
}
function database(data) {
  let query;
  return { get query() { return query; }, task: { findFirst: async (args) => { query = args; return data; }, findMany: async () => [] },
    auditEvent: { findMany: async () => [] },
    userSession: { findFirst: async () => ({ id: 'session', user: { id: 'user', role: { code: 'SECRETARY' } } }) } };
}
describe('detalhe e histórico com políticas de tempo distintas, sem banco', () => {
  it('serializa HTTP 200 após aceite sem calendário e pausa aberta, sem alterar os prazos', async () => {
    const data = task(); const original = structuredClone(data); const prisma = database(data);
    const config = { mailEnabled: false, jwtAccessSecret: 'unit-only-task-detail-secret-with-at-least-32-characters', accessTokenTtlSeconds: 900 };
    const token = await signAccessToken({ userId: 'user', sessionId: 'session', roleCode: 'SECRETARY' }, config);
    const app = createApp({ prisma, config, startOutboxWorker: false });
    const response = await request(app).get(`/api/v1/tasks/${id}`).set('authorization', `Bearer ${token}`);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const metrics = response.body.data.task.cycles[0].assignments[0].metrics;
    assert.equal(metrics.waitingMilliseconds, hour); assert.equal(metrics.effectiveWorkingMilliseconds, hour);
    assert.ok(metrics.pausedMilliseconds > 0); assert.ok(Object.values(metrics).every(Number.isFinite));
    assert.equal(response.body.data.task.cycle.executionDeadlineAt, original.currentCycle.executionDeadlineAt.toISOString());
    assert.deepEqual(data, original);
  });
  it('abre via HTTP uma tarefa concluída do Histórico sem calendário histórico', async () => {
    const data = task([cycle({ status: 'COMPLETED', deadlinePolicy: 'LEGACY_CALENDAR', closedAt: at('2026-01-02T00:00:00Z'),
      assignments: [assignment({ endedAt: at('2026-01-02T00:00:00Z'), calendarVersionId: null, calendarVersion: null, pauseIntervals: [] })] })]);
    const prisma = database(data);
    const config = { mailEnabled: false, jwtAccessSecret: 'unit-only-task-detail-secret-with-at-least-32-characters', accessTokenTtlSeconds: 900 };
    const token = await signAccessToken({ userId: 'user', sessionId: 'session', roleCode: 'SECRETARY' }, config);
    const app = createApp({ prisma, config, startOutboxWorker: false });
    const response = await request(app).get(`/api/v1/tasks/${id}`).set('authorization', `Bearer ${token}`);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.data.task.cycles[0].assignments[0].metrics, null);
    assert.equal(response.body.data.task.cycles[0].status, 'COMPLETED');
  });
  it('usa a política e o calendário de cada ciclo histórico, não a do ciclo atual', async () => {
    const legacy = cycle({ id: 'legacy-cycle', status: 'COMPLETED', deadlinePolicy: 'LEGACY_CALENDAR', openedAt: at('2026-11-09T12:00:00Z'), closedAt: at('2026-11-09T22:00:00Z'),
      acceptanceDeadlineAt: null, executionDeadlineAt: null, deadlineAt: at('2026-11-09T22:00:00Z'),
      assignments: [assignment({ id: 'legacy-assignment', assignedAt: at('2026-11-09T12:00:00Z'), acceptedAt: at('2026-11-09T13:00:00Z'), endedAt: at('2026-11-09T22:00:00Z'),
        calendarVersionId: 'published-version', calendarVersion: { calendar: { timezone: 'America/Cuiaba' }, schedules: [{ weekday: 1, startMinute: 540, endMinute: 1020 }], exceptions: [] },
        pauseIntervals: [{ startedAt: at('2026-11-09T14:00:00Z'), endedAt: at('2026-11-09T15:00:00Z') }] })] });
    const current = cycle({ cycleNumber: 2, status: 'COMPLETED', openedAt: at('2026-11-14T12:00:00Z'), closedAt: at('2026-11-14T22:00:00Z'),
      acceptanceDeadlineAt: at('2026-11-14T13:00:00Z'), executionDeadlineAt: at('2026-11-15T13:00:00Z'),
      assignments: [assignment({ assignedAt: at('2026-11-14T12:00:00Z'), acceptedAt: at('2026-11-14T13:00:00Z'), endedAt: at('2026-11-14T22:00:00Z'), pauseIntervals: [] })] });
    const data = task([legacy, current]); const original = structuredClone(data);
    const result = await createTaskService({ prisma: database(data) }).detail({ userId: 'secretary', roleCode: 'SECRETARY' }, id);
    assert.equal(result.cycle.id, current.id); assert.equal(result.cycles[0].assignments[0].metrics.effectiveWorkingMilliseconds, 7 * hour);
    assert.equal(result.cycles[1].assignments[0].metrics.effectiveWorkingMilliseconds, 9 * hour);
    assert.deepEqual(data, original); assert.equal(JSON.parse(JSON.stringify(result)).cycles.length, 2);
  });
  it('mantém o detalhe legível quando o calendário histórico não foi preservado', async () => {
    const legacy = cycle({ id: 'legacy-cycle', status: 'COMPLETED', deadlinePolicy: 'LEGACY_CALENDAR', closedAt: at('2026-01-02T00:00:00Z'),
      assignments: [assignment({ id: 'legacy-assignment', endedAt: at('2026-01-02T00:00:00Z'), calendarVersionId: null, calendarVersion: null, pauseIntervals: [] })] });
    const data = task([legacy]);
    const result = await createTaskService({ prisma: database(data) }).detail({ roleCode: 'SECRETARY' }, id);
    assert.equal(result.cycles[0].assignments[0].metrics, null);
    assert.equal(result.cycles[0].assignments[0].calendarVersionId, null);
    assert.equal(result.cycles[0].status, 'COMPLETED');
  });
  it('preserva o filtro de autorização por equipe no detalhe do Gestor', async () => {
    const prisma = database(task());
    await createTaskService({ prisma }).detail({ userId: 'manager', roleCode: 'MANAGER' }, id);
    assert.equal(prisma.query.where.team.managers.some.userId, 'manager');
  });
});
