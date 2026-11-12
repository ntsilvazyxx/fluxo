import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma.js';
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
    prisma = createPrismaClient(process.env.TEST_DATABASE_URL, { connectionLimit: 12 });
    app = createApp({ prisma, startOutboxWorker: false });
    users = { secretary: await createUser('SECRETARY'), manager: await createUser('MANAGER'), technician: await createUser('TECHNICIAN'), admin: await createUser('ADMIN_MASTER') };
  });
  after(async () => {
    try {
      if (createdIds.length) {
        await prisma.userSession.deleteMany({ where: { userId: { in: createdIds } } });
        await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
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
});
