import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';

import { createIntegrationApp as createApp } from '../../testing/integration/context.js';
import { createIntegrationPrisma as createPrismaClient } from '../../testing/integration/context.js';
import { parseIntegrationTarget as parseDatabaseUrl } from '../../testing/integration/context.js';
import { createDashboardService } from '../../src/modules/dashboard/dashboard.service.js';
import { hashPassword } from '../../src/shared/security/password.js';

const suite = process.env.RUN_DATABASE_INTEGRATION === '1' ? describe : describe.skip;
const password = 'Senha-Forte-2026';

suite('Fase 8 - autorização de indicadores no MariaDB real', () => {
  let prisma; let app; let users;
  const createdIds = [];
  const createUser = async (roleCode) => {
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    const user = await prisma.user.create({ data: { id: randomUUID(), name: `Fase 8 ${roleCode}`, emailNormalized: `${randomUUID()}@fase8.test`, passwordHash: await hashPassword(password), roleId: role.id } });
    createdIds.push(user.id); return user;
  };
  const token = async (user) => (await request(app).post('/api/v1/auth/login').send({ email: user.emailNormalized, password })).body.data.accessToken;

  before(async () => {
    assert.equal(parseDatabaseUrl(process.env.TEST_DATABASE_URL).database, 'seaf_gestao_integration');
    prisma = await createPrismaClient(process.env.TEST_DATABASE_URL, { connectionLimit: 12 });
    app = createApp({ prisma, startOutboxWorker: false });
    users = { secretary: await createUser('SECRETARY'), manager: await createUser('MANAGER'), technician: await createUser('TECHNICIAN'), admin: await createUser('ADMIN_MASTER') };
  });
  after(async () => {
    try {
      if (createdIds.length) {
        await prisma.userSession.deleteMany({ where: { userId: { in: createdIds } } });
        await prisma.user.updateMany({ where: { id: { in: createdIds } }, data: { isActive: false, deletedAt: new Date() } });
      }
    } finally { await prisma.$disconnect(); }
  });

  it('bloqueia Técnico e ADMIN MASTER inclusive no acesso direto', async () => {
    for (const actor of [users.technician, users.admin]) {
      const accessToken = await token(actor);
      for (const path of ['/api/v1/dashboard', '/api/v1/reports']) {
        const response = await request(app).get(path).set('authorization', `Bearer ${accessToken}`);
        assert.equal(response.status, 403);
      }
    }
  });

  it('permite as rotas a Secretário e Gestor dentro de seu escopo', async () => {
    for (const actor of [users.secretary, users.manager]) {
      const accessToken = await token(actor);
      const dashboard = await request(app).get('/api/v1/dashboard').set('authorization', `Bearer ${accessToken}`);
      const report = await request(app).get('/api/v1/reports').set('authorization', `Bearer ${accessToken}`);
      assert.equal(dashboard.status, 200);
      assert.equal(report.status, 200);
    }
  });

  it('isola equipes, exclui subtarefas dos totais e combina filtros no SQL real', async () => {
    const rollback = new Error('Rollback dos dados exclusivos deste teste');
    await assert.rejects(prisma.$transaction(async (tx) => {
      const team = await tx.team.create({ data: { id: randomUUID(), name: `Indicadores ${randomUUID()}` } });
      await tx.teamManager.create({ data: { id: randomUUID(), teamId: team.id, userId: users.manager.id, assignedAt: new Date() } });
      const createTask = async (priority, parentCycleId = null) => {
        const task = await tx.task.create({ data: { id: randomUUID(), teamId: team.id, createdById: users.secretary.id, parentCycleId } });
        const cycle = await tx.taskCycle.create({ data: {
          id: randomUUID(), taskId: task.id, cycleNumber: 1, title: 'Indicador isolado',
          description: 'Dados transacionais de validação', priority, openedAt: new Date('2026-11-12T12:00:00Z'),
        } });
        await tx.task.update({ where: { id: task.id }, data: { currentCycleId: cycle.id } });
        return cycle;
      };
      const parent = await createTask('HIGH');
      await createTask('NORMAL');
      await createTask('HIGH', parent.id);
      const service = createDashboardService({ prisma: tx });
      const actor = { userId: users.manager.id, roleCode: 'MANAGER' };
      const filters = { teamId: team.id, periodStart: new Date('2026-11-12T00:00:00Z'), periodEnd: new Date('2026-11-12T23:59:59.999Z') };
      const summary = await service.summary(actor, filters);
      assert.equal(summary.cards.totalCurrentTasks, 2);
      assert.equal(summary.cards.createdCycles, 2);
      const high = await service.summary(actor, { ...filters, priority: 'HIGH' });
      assert.equal(high.cards.totalCurrentTasks, 1);
      assert.equal(high.cards.createdCycles, 1);
      const outsidePeriod = await service.summary(actor, { ...filters, periodEnd: new Date('2026-11-12T11:59:59Z') });
      assert.equal(outsidePeriod.cards.totalCurrentTasks, 2);
      assert.equal(outsidePeriod.cards.createdCycles, 0);
      const outsider = await service.summary({ userId: users.technician.id, roleCode: 'MANAGER' }, filters);
      assert.equal(outsider.cards.totalCurrentTasks, 0);
      assert.equal(outsider.cards.createdCycles, 0);
      const reportFilters = { ...filters, page: 1, pageSize: 20, sortBy: 'openedAt', sortDirection: 'desc' };
      assert.equal((await service.report(actor, reportFilters)).meta.total, 3);
      assert.equal((await service.report(actor, { ...reportFilters, status: 'COMPLETED', deadlineSituation: 'OVERDUE' })).meta.total, 0);
      throw rollback;
    }, { timeout: 20_000 }), (error) => error === rollback);
  });

  it('conta encerramentos históricos e novos ciclos sem duplicar tarefas reabertas ou restauradas', async () => {
    const rollback = new Error('Rollback dos ciclos históricos de validação');
    await assert.rejects(prisma.$transaction(async (tx) => {
      const team = await tx.team.create({ data: { id: randomUUID(), name: `Ciclos ${randomUUID()}` } });
      await tx.teamManager.create({ data: { id: randomUUID(), teamId: team.id, userId: users.manager.id, assignedAt: new Date() } });
      for (const status of ['COMPLETED', 'CANCELLED']) {
        const task = await tx.task.create({ data: { id: randomUUID(), teamId: team.id, createdById: users.secretary.id } });
        await tx.taskCycle.create({ data: {
          id: randomUUID(), taskId: task.id, cycleNumber: 1, title: 'Ciclo histórico', description: 'Histórico preservado',
          status, priority: 'HIGH', openedAt: new Date('2026-11-10T12:00:00Z'), closedAt: new Date('2026-11-11T12:00:00Z'),
          deadlineAt: new Date('2026-11-11T13:00:00Z'), ...(status === 'COMPLETED' ? { completionText: 'Entrega validada' } : {}),
        } });
        const current = await tx.taskCycle.create({ data: {
          id: randomUUID(), taskId: task.id, cycleNumber: 2, title: 'Novo ciclo', description: 'Sem copiar responsabilidade ou prazo',
          openedAt: new Date('2026-11-12T12:00:00Z'), status: 'PENDING', priority: 'NORMAL',
        } });
        await tx.task.update({ where: { id: task.id }, data: { currentCycleId: current.id } });
      }
      const service = createDashboardService({ prisma: tx });
      const actor = { roleCode: 'MANAGER', userId: users.manager.id };
      const filters = { teamId: team.id, periodStart: new Date('2026-11-11T00:00:00Z'), periodEnd: new Date('2026-11-11T23:59:59.999Z') };
      const history = await service.summary(actor, filters);
      assert.equal(history.cards.totalCurrentTasks, 2);
      assert.equal(history.cards.pending, 2);
      assert.equal(history.cards.createdCycles, 0);
      assert.equal(history.cards.completedCycles, 1);
      assert.equal(history.cards.cancelledCycles, 1);
      assert.equal(history.cards.completionRate, 50);
      assert.deepEqual(history.charts.completedOnTime, { onTime: 1, late: 0 });
      const oldPriority = await service.summary(actor, { ...filters, priority: 'HIGH' });
      assert.equal(oldPriority.cards.totalCurrentTasks, 0);
      assert.equal(oldPriority.cards.completedCycles, 1);
      assert.equal(oldPriority.cards.cancelledCycles, 1);
      const all = await service.summary(actor, { teamId: team.id });
      assert.equal(all.cards.totalCurrentTasks, 2);
      assert.equal(all.cards.createdCycles, 4);
      const reopened = await service.summary(actor, { ...filters, periodStart: new Date('2026-11-12T00:00:00Z'), periodEnd: new Date('2026-11-12T23:59:59.999Z') });
      assert.equal(reopened.cards.createdCycles, 2);
      assert.equal(reopened.cards.completedCycles, 0);
      assert.equal(reopened.cards.cancelledCycles, 0);
      throw rollback;
    }, { timeout: 20_000 }), (error) => error === rollback);
  });
});
