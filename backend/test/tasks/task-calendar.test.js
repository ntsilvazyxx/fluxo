import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTaskService } from '../../src/modules/tasks/task.service.js';

const makePrismaMock = () => {
  const dummyTask = {
    id: 'task-cal-1',
    publicNumber: 101n,
    teamId: 'team-1',
    parentCycleId: null,
    currentCycleId: 'cycle-1',
    deletedAt: null,
    sigadocProcessNumber: '123/2026',
    sigadocProcessLink: 'https://sigadoc.mt.gov.br/processo/123',
    team: { id: 'team-1', name: 'Equipe de Fomento' },
    currentCycle: {
      id: 'cycle-1',
      title: 'Análise de processo de crédito',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      deadlineAt: new Date('2026-11-20T17:00:00Z'),
      openedAt: new Date('2026-11-01T08:00:00Z'),
      assignments: [
        {
          id: 'asg-1',
          userId: 'user-1',
          user: { id: 'user-1', name: 'Técnico Silva' },
          endedAt: null,
        },
      ],
    },
  };

  const dummyException = {
    id: 'exc-1',
    localDate: new Date('2026-11-20T00:00:00Z'),
    type: 'HOLIDAY',
    description: 'Consciência Negra',
  };

  return {
    task: {
      findMany: async () => [dummyTask],
    },
    calendarException: {
      findMany: async () => [dummyException],
    },
  };
};

describe('Task Calendar Service', () => {
  it('retorna tarefas e exceções para o mês solicitado', async () => {
    const prisma = makePrismaMock();
    const service = createTaskService({ prisma, attachmentService: {} });

    const actor = { userId: 'user-1', roleCode: 'ADMIN_MASTER' };
    const result = await service.calendar(actor, { month: '2026-11' });

    assert.ok(result.period, 'Period deve estar presente');
    assert.equal(result.tasks.length, 1);
    assert.equal(result.tasks[0].id, 'task-cal-1');
    assert.equal(result.tasks[0].cycle.title, 'Análise de processo de crédito');
    assert.equal(result.exceptions.length, 1);
    assert.equal(result.exceptions[0].type, 'HOLIDAY');
    assert.equal(result.exceptions[0].description, 'Consciência Negra');
  });
});
