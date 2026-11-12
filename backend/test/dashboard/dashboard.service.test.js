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
});
