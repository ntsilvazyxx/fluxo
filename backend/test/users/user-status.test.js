import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { signAccessToken } from '../../src/shared/security/tokens.js';

const actorId = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';
const sessionId = '00000000-0000-4000-8000-000000000003';
const role = { id: '00000000-0000-4000-8000-000000000004', code: 'TECHNICIAN', label: 'Técnico' };
const config = {
  corsOrigins: ['http://localhost:5173'],
  jwtAccessSecret: 'unit-only-user-status-secret-with-at-least-32-characters',
  accessTokenTtlSeconds: 900,
  mailEnabled: false,
};

function isolatedDatabase(roleCode = 'ADMIN_MASTER') {
  const state = {
    user: {
      id: targetId,
      name: 'Usuário Isolado',
      emailNormalized: 'isolado@example.test',
      role,
      isActive: true,
      version: 4,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
    },
    revokedSessions: 0,
    audits: [],
    transactions: 0,
  };
  const tx = {
    user: {
      findFirst: async ({ where }) => where.id === state.user.id && state.user.deletedAt === null ? { ...state.user } : null,
      update: async ({ where, data }) => {
        assert.equal(where.id, state.user.id);
        state.user = {
          ...state.user,
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          version: state.user.version + 1,
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        };
        return { ...state.user };
      },
    },
    role: { findUnique: async () => null },
    userSession: {
      updateMany: async ({ where, data }) => {
        assert.deepEqual(where, { userId: targetId, revokedAt: null });
        assert.ok(data.revokedAt instanceof Date);
        state.revokedSessions += 2;
        return { count: 2 };
      },
    },
    auditEvent: {
      create: async ({ data }) => {
        state.audits.push(data);
        return data;
      },
    },
  };
  const prisma = {
    userSession: {
      findFirst: async () => ({
        id: sessionId,
        user: { id: actorId, isActive: true, deletedAt: null, role: { code: roleCode } },
      }),
    },
    $transaction: async (operation) => {
      state.transactions += 1;
      return operation(tx);
    },
  };
  return { prisma, state };
}

async function authorizedApp(roleCode = 'ADMIN_MASTER') {
  const database = isolatedDatabase(roleCode);
  const token = await signAccessToken({ userId: actorId, sessionId, roleCode }, config);
  return {
    ...database,
    app: createApp({ prisma: database.prisma, config, startOutboxWorker: false }),
    authorization: `Bearer ${token}`,
  };
}

describe('alteração isolada da situação de usuário', () => {
  it('inativa, incrementa a versão, revoga sessões e audita na mesma transação', async () => {
    const { app, authorization, state } = await authorizedApp();
    const response = await request(app)
      .patch(`/api/v1/users/${targetId}`)
      .set('authorization', authorization)
      .send({ isActive: false, reason: 'Desligamento confirmado em teste isolado' });

    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.data.user.isActive, false);
    assert.equal(response.body.data.user.version, 5);
    assert.equal(state.user.isActive, false);
    assert.equal(state.revokedSessions, 2);
    assert.equal(state.transactions, 1);
    assert.equal(state.audits.length, 1);
    assert.equal(state.audits[0].action, 'USER_UPDATED');
    assert.equal(state.audits[0].actorId, actorId);
    assert.equal(state.audits[0].entityId, targetId);
    assert.equal(state.audits[0].reason, 'Desligamento confirmado em teste isolado');
    assert.equal(state.audits[0].beforeJson.isActive, true);
    assert.equal(state.audits[0].afterJson.isActive, false);
  });

  it('rejeita a tentativa de inativar a própria conta antes da transação', async () => {
    const { app, authorization, state } = await authorizedApp();
    const response = await request(app)
      .patch(`/api/v1/users/${actorId}`)
      .set('authorization', authorization)
      .send({ isActive: false, reason: 'Tentativa bloqueada no teste' });

    assert.equal(response.status, 422);
    assert.equal(response.body.error.code, 'CANNOT_DEACTIVATE_SELF');
    assert.equal(state.transactions, 0);
  });

  it('rejeita usuário sem permissão antes da transação', async () => {
    const { app, authorization, state } = await authorizedApp('SECRETARY');
    const response = await request(app)
      .patch(`/api/v1/users/${targetId}`)
      .set('authorization', authorization)
      .send({ isActive: false, reason: 'Tentativa sem permissão' });

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'FORBIDDEN');
    assert.equal(state.transactions, 0);
  });

  it('rejeita justificativa inválida antes da transação', async () => {
    const { app, authorization, state } = await authorizedApp();
    const response = await request(app)
      .patch(`/api/v1/users/${targetId}`)
      .set('authorization', authorization)
      .send({ isActive: false, reason: 'não' });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.equal(state.transactions, 0);
  });
});
