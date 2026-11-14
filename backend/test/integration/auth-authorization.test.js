import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { createIntegrationApp as createApp } from '../../testing/integration/context.js';
import { createIntegrationPrisma as createPrismaClient } from '../../testing/integration/context.js';
import { hashPassword } from '../../src/shared/security/password.js';

const enabled = process.env.RUN_DATABASE_INTEGRATION === '1';
const suite = enabled ? describe : describe.skip;
const password = 'Senha-Forte-2026';
const config = { corsOrigins: ['http://localhost:5173'], jwtAccessSecret: 'integration-secret-at-least-thirty-two-characters', accessTokenTtlSeconds: 900, refreshTokenTtlDays: 1, passwordResetTtlMinutes: 30, loginWindowMinutes: 15, loginMaxAttempts: 100, cookieSecure: false };

suite('autenticação e autorização no MariaDB real', () => {
  let prisma; let app; let roles; let admin; let manager; let technician; let other; let team; let foreignTeam; let resetNotice;
  const makeUser = async (role, label) => prisma.user.create({ data: { id: randomUUID(), name: label, emailNormalized: `${label.toLowerCase().replaceAll(' ','-')}-${randomUUID()}@teste.seaf.local`, passwordHash: await hashPassword(password), roleId: roles[role].id }, include: { role: true } });
  const login = (user) => request(app).post('/api/v1/auth/login').send({ email: user.emailNormalized, password });
  const bearer = async (user) => `Bearer ${(await login(user)).body.data.accessToken}`;

  before(async () => {
    prisma = await createPrismaClient(process.env.TEST_DATABASE_URL, { connectionLimit: 12 });
    const roleRows = await prisma.role.findMany(); roles = Object.fromEntries(roleRows.map((r) => [r.code, r]));
    assert.equal(Object.keys(roles).length, 4, 'O seed dos quatro perfis deve existir no banco de testes.');
    [admin, manager, technician, other] = await Promise.all([makeUser('ADMIN_MASTER','Admin Fase Dois'), makeUser('MANAGER','Gestor Fase Dois'), makeUser('TECHNICIAN','Tecnico Fase Dois'), makeUser('TECHNICIAN','Outro Tecnico')]);
    [team, foreignTeam] = await Promise.all([prisma.team.create({ data: { id: randomUUID(), name: `Equipe teste ${randomUUID()}` } }), prisma.team.create({ data: { id: randomUUID(), name: `Equipe externa ${randomUUID()}` } })]);
    await Promise.all([prisma.teamManager.create({ data: { id: randomUUID(), teamId: team.id, userId: manager.id, assignedAt: new Date() } }), prisma.teamMember.create({ data: { id: randomUUID(), teamId: team.id, userId: technician.id, joinedAt: new Date() } }), prisma.teamMember.create({ data: { id: randomUUID(), teamId: foreignTeam.id, userId: other.id, joinedAt: new Date() } })]);
    app = createApp({ prisma, config, passwordResetNotifier: async (notice) => { resetNotice = notice; } });
  });
  after(async () => prisma.$disconnect());

  it('faz login, não expõe hash e grava refresh em cookie HttpOnly', async () => { const response = await login(admin); assert.equal(response.status, 200); assert.equal(response.body.data.user.passwordHash, undefined); assert.match(response.headers['set-cookie'][0], /HttpOnly/); assert.match(response.headers['set-cookie'][0], /SameSite=Strict/); });
  it('recusa usuário inativo e revoga acesso já emitido', async () => { const token = await bearer(other); await prisma.user.update({ where: { id: other.id }, data: { isActive: false } }); assert.equal((await login(other)).status, 401); assert.equal((await request(app).get(`/api/v1/users/${other.id}`).set('authorization', token)).status, 401); });
  it('bloqueia IDOR entre equipes com resposta 404', async () => { const token = await bearer(manager); assert.equal((await request(app).get(`/api/v1/teams/${team.id}`).set('authorization', token)).status, 200); assert.equal((await request(app).get(`/api/v1/teams/${foreignTeam.id}`).set('authorization', token)).status, 404); });
  it('impede perfil Gestor de criar usuários', async () => { const token = await bearer(manager); const response = await request(app).post('/api/v1/users').set('authorization', token).send({ name: 'Tentativa Indevida', email: `${randomUUID()}@teste.local`, password, roleCode: 'TECHNICIAN' }); assert.equal(response.status, 403); });
  it('aceita somente uma rotação concorrente do mesmo refresh token', async () => { const response = await login(technician); const cookie = response.headers['set-cookie'][0].split(';')[0]; const results = await Promise.all([request(app).post('/api/v1/auth/refresh').set('cookie', cookie), request(app).post('/api/v1/auth/refresh').set('cookie', cookie)]); assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]); });
  it('revoga sessão no logout', async () => { const response = await login(technician); const cookie = response.headers['set-cookie'][0].split(';')[0]; assert.equal((await request(app).post('/api/v1/auth/logout').set('cookie', cookie)).status, 204); assert.equal((await request(app).post('/api/v1/auth/refresh').set('cookie', cookie)).status, 401); });
  it('rejeita access token expirado', async () => { const shortApp = createApp({ prisma, config: { ...config, accessTokenTtlSeconds: 1 }, passwordResetNotifier: async () => {} }); const response = await request(shortApp).post('/api/v1/auth/login').send({ email: manager.emailNormalized, password }); await new Promise((resolve) => setTimeout(resolve, 1100)); assert.equal((await request(shortApp).get('/api/v1/users').set('authorization', `Bearer ${response.body.data.accessToken}`)).status, 401); });
  it('impede vínculo organizacional ativo duplicado', async () => { const token = await bearer(admin); const response = await request(app).post(`/api/v1/teams/${team.id}/members/${technician.id}`).set('authorization', token); assert.equal(response.status, 409); });
  it('redefine senha com token temporário de uso único e revoga sessões', async () => { resetNotice = null; await request(app).post('/api/v1/auth/password/forgot').send({ email: technician.emailNormalized }); assert.equal(resetNotice.email, technician.emailNormalized); const newPassword = 'Nova-Senha-2026'; assert.equal((await request(app).post('/api/v1/auth/password/reset').send({ token: resetNotice.token, password: newPassword })).status, 204); assert.equal((await request(app).post('/api/v1/auth/password/reset').send({ token: resetNotice.token, password: newPassword })).status, 400); assert.equal((await request(app).post('/api/v1/auth/login').send({ email: technician.emailNormalized, password: newPassword })).status, 200); });
});
