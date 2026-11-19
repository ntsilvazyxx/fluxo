import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardService } from '../../src/modules/dashboard/dashboard.service.js';

describe('Relatórios e Exportações CSV/Excel', () => {
  it('gera exportação formatada e sanitiza injeção de fórmulas', async () => {
    const dummyTask = {
      id: 'task-exp-1',
      publicNumber: 77n,
      teamId: 'team-1',
      parentCycleId: null,
      team: { id: 'team-1', name: 'Gabinete SEAF' },
      currentCycle: {
        title: '=SUM(A1:A10)', // Tentativa de injeção de fórmula
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        openedAt: new Date('2026-11-01T10:00:00Z'),
        closedAt: null,
        deadlineAt: new Date('2026-11-20T18:00:00Z'),
        assignments: [
          {
            user: { id: 'u1', name: '+Nathan Silva' }, // Inicia com +
          },
        ],
      },
    };

    const prismaMock = {
      task: {
        count: async () => 1,
        findMany: async () => [dummyTask],
      },
    };

    const service = createDashboardService({ prisma: prismaMock });
    const actor = { userId: 'admin-1', roleCode: 'ADMIN_MASTER' };

    const result = await service.exportCsv(actor, {});

    assert.ok(result.filename.startsWith('relatorio-tarefas-seaf-'));
    assert.ok(result.csv.startsWith('\uFEFF'), 'Deve conter BOM UTF-8 para abertura automática no Excel');

    // Confirma que a injeção com = foi neutralizada com prefixo de apóstrofo '
    assert.ok(result.csv.includes(`"'=SUM(A1:A10)"`), 'Fórmula iniciada por = deve ser neutralizada com aspas simples');

    // Confirma que nome com + foi neutralizado
    assert.ok(result.csv.includes(`"'+Nathan Silva"`), 'Texto iniciado por + deve ser neutralizado com aspas simples');

    // Confirma cabeçalho
    assert.ok(result.csv.includes('"Número";"Título";"Equipe"'));
  });
});
