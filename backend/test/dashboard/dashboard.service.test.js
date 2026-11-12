import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createDashboardService } from '../../src/modules/dashboard/dashboard.service.js';

const now = new Date();
const task = (id, status, priority = 'NORMAL') => ({
  id, parentCycleId: null, publicNumber: BigInt(id === 'task-1' ? 1 : 2), team: { id: 'team-1', name: 'Equipe 1' },
  currentCycle: { id: `cycle-${id}`, title: `Tarefa ${id}`, status, priority, deadlineAt: status === 'IN_PROGRESS' ? new Date(now.getTime() - 1000) : null, openedAt: now, closedAt: null, assignments: [] },
});

describe('dashboard service', () => {
  it('separa situação atual por tarefa dos indicadores históricos por ciclo', async () => {
    const current = [task('task-1', 'PENDING'), task('task-2', 'IN_PROGRESS', 'HIGH')];
    const prisma = {
      task: { findMany: async () => current, count: async () => current.length },
      taskCycle: { findMany: async () => [
        { id: 'old-1', taskId: 'task-1', status: 'COMPLETED', deadlineAt: now, openedAt: now, closedAt: new Date(now.getTime() - 1000) },
        { id: 'old-2', taskId: 'task-2', status: 'CANCELLED', deadlineAt: null, openedAt: now, closedAt: now },
      ] },
    };
    const service = createDashboardService({ prisma });
    const summary = await service.summary({ roleCode: 'SECRETARY', userId: 'secretary' }, {});
    assert.equal(summary.cards.totalCurrentTasks, 2);
    assert.equal(summary.cards.pending, 1);
    assert.equal(summary.cards.overdue, 1);
    assert.equal(summary.cards.createdCycles, 2);
    assert.equal(summary.cards.completedCycles, 1);
    assert.equal(summary.cards.cancelledCycles, 1);
    assert.equal(summary.cards.completionRate, 50);
    assert.equal(summary.charts.completedOnTime.onTime, 1);
  });

  it('preserva paginação e expõe subtarefas apenas no relatório detalhado', async () => {
    const current = [{ ...task('task-1', 'PENDING'), parentCycleId: 'parent-cycle' }];
    const prisma = { task: { findMany: async () => current, count: async () => 1 } };
    const service = createDashboardService({ prisma });
    const report = await service.report({ roleCode: 'MANAGER', userId: 'manager' }, { page: 1, pageSize: 20, sortBy: 'openedAt', sortDirection: 'desc' });
    assert.equal(report.meta.total, 1);
    assert.equal(report.rows[0].isSubtask, true);
  });

  it('combina status e prazo sem sobrescrever o estado solicitado', async () => {
    let where;
    const service = createDashboardService({ prisma: { task: {
      count: async () => 0,
      findMany: async (query) => { where = query.where; return []; },
    } } });
    await service.report({ roleCode: 'MANAGER', userId: 'manager' }, {
      status: 'COMPLETED', deadlineSituation: 'OVERDUE', page: 1, pageSize: 20,
      sortBy: 'openedAt', sortDirection: 'desc',
    });
    assert.deepEqual(where.currentCycle.status, { in: ['PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS'] });
    assert.deepEqual(where.currentCycle.AND, [{ status: 'COMPLETED' }]);
    assert.equal(where.team.managers.some.userId, 'manager');
  });

  it('exclui registros sem ciclo atual antes da contagem e paginação do relatório', async () => {
    const queries = [];
    const service = createDashboardService({ prisma: { task: {
      count: async ({ where }) => { queries.push(where); return 0; },
      findMany: async ({ where }) => { queries.push(where); return []; },
    } } });
    await service.report({ roleCode: 'SECRETARY', userId: 'secretary' }, {
      page: 1, pageSize: 20, sortBy: 'openedAt', sortDirection: 'desc',
    });
    assert.equal(queries.length, 2);
    for (const where of queries) assert.deepEqual(where.currentCycleId, { not: null });
  });

  it('aplica filtros ao próprio ciclo histórico e preserva atribuições encerradas', async () => {
    let currentWhere; let historicalWhere;
    const service = createDashboardService({ prisma: {
      task: { findMany: async ({ where }) => { currentWhere = where; return []; } },
      taskCycle: { findMany: async ({ where }) => { historicalWhere = where; return []; } },
    } });
    await service.summary({ roleCode: 'MANAGER', userId: 'manager' }, {
      priority: 'HIGH', responsibleId: 'responsible', status: 'COMPLETED', teamId: 'team',
    });
    assert.equal(historicalWhere.priority, 'HIGH');
    assert.deepEqual(historicalWhere.AND, [{ status: 'COMPLETED' }]);
    assert.deepEqual(historicalWhere.assignments, { some: { userId: 'responsible' } });
    assert.equal(currentWhere.currentCycle.assignments.some.endedAt, null);
    assert.equal(historicalWhere.task.parentCycleId, null);
    assert.equal(historicalWhere.task.teamId, 'team');
    assert.equal(historicalWhere.task.team.managers.some.userId, 'manager');
  });
});
