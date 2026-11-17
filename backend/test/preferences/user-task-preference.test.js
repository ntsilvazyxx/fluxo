import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPreferenceService } from '../../src/modules/preferences/preference.service.js';

describe('preferências individuais de cor de cartão (UserTaskPreference)', () => {
  const makeMockPrisma = () => {
    const tasks = [
      { id: '11111111-1111-4111-8111-111111111111', teamId: 'team-alpha', deletedAt: null, currentCycle: { assignments: [{ userId: 'tech-1', endedAt: null }] } },
      { id: '22222222-2222-4222-8222-222222222222', teamId: 'team-alpha', deletedAt: null, currentCycle: { assignments: [{ userId: 'tech-2', endedAt: null }] } },
      { id: '33333333-3333-4333-8333-333333333333', teamId: 'team-beta', deletedAt: null, currentCycle: { assignments: [{ userId: 'tech-3', endedAt: null }] } },
      { id: '44444444-4444-4444-8444-444444444444', teamId: 'team-beta', deletedAt: new Date(), currentCycle: { assignments: [{ userId: 'tech-1', endedAt: null }] } }, // Excluída logicamente
    ];

    let preferences = [];

    return {
      task: {
        async findMany({ where }) {
          return tasks.filter((t) => {
            if (t.deletedAt) return false;
            if (where.id?.in && !where.id.in.includes(t.id)) return false;
            // Filtro de autorização por ator
            if (where.AND) {
              for (const condition of where.AND) {
                if (condition.team?.managers?.some) {
                  const managerCondition = condition.team.managers.some;
                  if (managerCondition.userId === 'manager-alpha' && t.teamId !== 'team-alpha') return false;
                }
                if (condition.currentCycle?.assignments?.some) {
                  const assignCondition = condition.currentCycle.assignments.some;
                  const hasUser = t.currentCycle.assignments.some((a) => a.userId === assignCondition.userId);
                  if (!hasUser) return false;
                }
              }
            }
            return true;
          });
        },
        async findFirst({ where }) {
          const list = await this.findMany({ where });
          return list.find((t) => !where.id || t.id === where.id) || null;
        },
      },
      userTaskPreference: {
        async findMany({ where }) {
          return preferences.filter((p) => {
            if (p.userId !== where.userId) return false;
            if (where.taskId?.in && !where.taskId.in.includes(p.taskId)) return false;
            return true;
          });
        },
        async upsert({ where, create, update }) {
          const idx = preferences.findIndex(
            (p) => p.userId === where.userId_taskId.userId && p.taskId === where.userId_taskId.taskId,
          );
          if (idx >= 0) {
            preferences[idx] = { ...preferences[idx], ...update };
            return { taskId: preferences[idx].taskId, color: preferences[idx].color };
          }
          const item = { ...create };
          preferences.push(item);
          return { taskId: item.taskId, color: item.color };
        },
        async deleteMany({ where }) {
          const initialLen = preferences.length;
          preferences = preferences.filter(
            (p) => !(p.userId === where.userId && p.taskId === where.taskId),
          );
          return { count: initialLen - preferences.length };
        },
      },
    };
  };

  it('salva e recupera a cor da tarefa para o usuário autenticado', async () => {
    const prisma = makeMockPrisma();
    const service = createPreferenceService({ prisma });
    const actor = { userId: 'manager-alpha', roleCode: 'MANAGER' };
    const taskId = '11111111-1111-4111-8111-111111111111';

    const saved = await service.updateKanbanColor(actor, taskId, 'blue');
    assert.deepEqual(saved, { taskId, color: 'blue' });

    const result = await service.listKanbanColors(actor, { taskIds: taskId });
    assert.deepEqual(result, { colors: { [taskId]: 'blue' } });
  });

  it('garante isolamento estrito entre usuários para a mesma tarefa', async () => {
    const prisma = makeMockPrisma();
    const service = createPreferenceService({ prisma });
    const actorA = { userId: 'admin-1', roleCode: 'ADMIN_MASTER' };
    const actorB = { userId: 'admin-2', roleCode: 'ADMIN_MASTER' };
    const taskId = '11111111-1111-4111-8111-111111111111';

    // Usuário A define azul
    await service.updateKanbanColor(actorA, taskId, 'blue');

    // Usuário B consulta e não vê a cor de A
    const resultBInitial = await service.listKanbanColors(actorB, { taskIds: taskId });
    assert.deepEqual(resultBInitial, { colors: {} });

    // Usuário B define rosa
    await service.updateKanbanColor(actorB, taskId, 'rose');

    // Cada um vê exclusivamente a sua preferência
    const resultA = await service.listKanbanColors(actorA, { taskIds: taskId });
    const resultB = await service.listKanbanColors(actorB, { taskIds: taskId });
    assert.equal(resultA.colors[taskId], 'blue');
    assert.equal(resultB.colors[taskId], 'rose');
  });

  it('restaura a cor padrão removendo o registro do banco', async () => {
    const prisma = makeMockPrisma();
    const service = createPreferenceService({ prisma });
    const actor = { userId: 'manager-alpha', roleCode: 'MANAGER' };
    const taskId = '11111111-1111-4111-8111-111111111111';

    await service.updateKanbanColor(actor, taskId, 'emerald');
    let result = await service.listKanbanColors(actor, { taskIds: taskId });
    assert.equal(result.colors[taskId], 'emerald');

    // Restaurar com 'default'
    await service.updateKanbanColor(actor, taskId, 'default');
    result = await service.listKanbanColors(actor, { taskIds: taskId });
    assert.deepEqual(result, { colors: {} });

    // Restaurar com deleteKanbanColor
    await service.updateKanbanColor(actor, taskId, 'amber');
    await service.deleteKanbanColor(actor, taskId);
    result = await service.listKanbanColors(actor, { taskIds: taskId });
    assert.deepEqual(result, { colors: {} });
  });

  it('impede salvar ou consultar preferência de tarefa fora do escopo do usuário (404)', async () => {
    const prisma = makeMockPrisma();
    const service = createPreferenceService({ prisma });
    const managerAlpha = { userId: 'manager-alpha', roleCode: 'MANAGER' };
    const taskTeamBeta = '33333333-3333-4333-8333-333333333333'; // Pertence a outra equipe

    await assert.rejects(
      async () => service.updateKanbanColor(managerAlpha, taskTeamBeta, 'purple'),
      (err) => err.status === 404 && err.code === 'TASK_NOT_FOUND',
    );

    await assert.rejects(
      async () => service.deleteKanbanColor(managerAlpha, taskTeamBeta),
      (err) => err.status === 404 && err.code === 'TASK_NOT_FOUND',
    );

    // Consulta em lote filtra tarefas fora do escopo silenciosamente
    const listResult = await service.listKanbanColors(managerAlpha, { taskIds: taskTeamBeta });
    assert.deepEqual(listResult, { colors: {} });
  });

  it('impede ações em tarefas excluídas logicamente (deletedAt)', async () => {
    const prisma = makeMockPrisma();
    const service = createPreferenceService({ prisma });
    const admin = { userId: 'admin-1', roleCode: 'ADMIN_MASTER' };
    const deletedTaskId = '44444444-4444-4444-8444-444444444444';

    await assert.rejects(
      async () => service.updateKanbanColor(admin, deletedTaskId, 'orange'),
      (err) => err.status === 404 && err.code === 'TASK_NOT_FOUND',
    );
  });
});
