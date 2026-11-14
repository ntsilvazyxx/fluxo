import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { signAccessToken } from '../../src/shared/security/tokens.js';

const id = '00000000-0000-4000-8000-000000000001';
const config = {
  mailEnabled: false,
  jwtAccessSecret: 'unit-only-task-creation-secret-with-at-least-32-characters',
  accessTokenTtlSeconds: 900,
  nodeEnv: 'development',
  adminTaskCreationEnabled: false,
};
const database = (roleCode) => ({
  userSession: {
    findFirst: async () => ({
      id: 'session',
      user: { id: 'user', isActive: true, deletedAt: null, role: { code: roleCode } },
    }),
  },
  task: {
    findFirst: async () => ({ currentCycleId: 'cycle' }),
    findMany: async () => [],
  },
});
async function appFor(roleCode, overrides = {}) {
  const settings = { ...config, ...overrides };
  const token = await signAccessToken({ userId: 'user', sessionId: 'session', roleCode }, settings);
  return {
    app: createApp({ prisma: database(roleCode), config: settings, startOutboxWorker: false }),
    token,
  };
}

describe('criação excepcional de tarefas pelo ADMIN MASTER', () => {
  it('recusa ADMIN MASTER quando o recurso está desabilitado por padrão', async () => {
    const { app, token } = await appFor('ADMIN_MASTER');
    const response = await request(app).post('/api/v1/tasks').set('authorization', `Bearer ${token}`).send({});
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'ADMIN_TASK_CREATION_DISABLED');
  });

  it('recusa a exceção em produção mesmo com a variável habilitada', async () => {
    const { app, token } = await appFor('ADMIN_MASTER', { adminTaskCreationEnabled: true, nodeEnv: 'production' });
    const response = await request(app).post('/api/v1/tasks').set('authorization', `Bearer ${token}`).send({});
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'ADMIN_TASK_CREATION_DISABLED');
  });

  it('mantém as validações normais quando o recurso está habilitado em ambiente não produtivo', async () => {
    const { app, token } = await appFor('ADMIN_MASTER', { adminTaskCreationEnabled: true });
    const response = await request(app).post('/api/v1/tasks').set('authorization', `Bearer ${token}`).send({});
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  });

  it('não altera a criação normal de SECRETARY e MANAGER', async () => {
    for (const roleCode of ['SECRETARY', 'MANAGER']) {
      const { app, token } = await appFor(roleCode);
      const response = await request(app).post('/api/v1/tasks').set('authorization', `Bearer ${token}`).send({});
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    }
  });
});

describe('subtarefas aposentadas', () => {
  it('recusa novas subtarefas com resposta controlada', async () => {
    const { app, token } = await appFor('MANAGER');
    const response = await request(app)
      .post(`/api/v1/tasks/${id}/subtasks`)
      .set('authorization', `Bearer ${token}`)
      .send({ title: 'Subtarefa nova', description: 'Não deve ser criada', userId: id, deadlineAt: '2027-01-01T00:00:00.000Z' });
    assert.equal(response.status, 410);
    assert.equal(response.body.error.code, 'SUBTASK_CREATION_RETIRED');
  });

  it('preserva a consulta somente leitura de subtarefas históricas', async () => {
    const { app, token } = await appFor('MANAGER');
    const response = await request(app).get(`/api/v1/tasks/${id}/subtasks`).set('authorization', `Bearer ${token}`);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(response.body.data.subtasks, []);
  });
});
