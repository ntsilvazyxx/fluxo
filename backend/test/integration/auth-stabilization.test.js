import assert from 'node:assert/strict';
import { before, after, describe, it } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import nodemailer from 'nodemailer';
import request from 'supertest';
import { integrationConfig } from '../../testing/integration/context.js';
import { createIntegrationApp as createApp } from '../../testing/integration/context.js';
import { createEmailSender } from '../../src/modules/outbox/outbox.sender.js';
import { createOutboxService } from '../../src/modules/outbox/outbox.service.js';
import { hashOpaqueToken } from '../../src/shared/security/tokens.js';
import { fixtures } from '../../testing/integration/fixtures.js';
import { testDatabase } from '../../testing/integration/context.js';

describe('Fase 9 estabilização - recuperação com transporte local', { skip: process.env.RUN_DATABASE_INTEGRATION !== '1' }, () => {
  let prisma; let data; let app; let config; let session; const messages = [];
  const login = (who = 'admin', password = data.password) => request(app).post('/api/v1/auth/login').send({ email: data.users[who].emailNormalized, password });
  const cookie = (response) => response.headers['set-cookie'][0].split(';')[0];
  before(async () => {
    ({ prisma } = await testDatabase()); data = await fixtures(prisma);
    config = { ...integrationConfig(), authDataEncryptionKey: randomBytes(32).toString('hex'), loginMaxAttempts: 200, cookieSecure: false };
    app = createApp({ prisma, config });
  });
  after(async () => { await prisma?.$disconnect(); });
  it('migração compensatória mantém cadeia de checksums e arquivos MFA fora do cliente ativo', async () => {
    const rows = await prisma.$queryRaw`SELECT migration_name AS name, checksum, finished_at AS finished, rolled_back_at AS rolledBack FROM _prisma_migrations ORDER BY migration_name`;
    for (const row of rows) {
      assert.ok(row.finished); assert.equal(row.rolledBack, null);
      const checksum = createHash('sha256').update(readFileSync(`prisma/migrations/${row.name}/migration.sql`)).digest('hex');
      assert.equal(row.checksum, checksum);
    }
    assert.ok(rows.some((row) => row.name === '20261112233000_auth_mfa_sessions'));
    assert.ok(rows.some((row) => row.name === '20261113001000_retire_mfa_preserve_history'));
    for (const delegate of ['authChallenge', 'mfaCredential', 'legacyAuthChallenge', 'legacyMfaCredential']) assert.equal(prisma[delegate], undefined);
    const tables = await prisma.$queryRaw`SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('auth_challenges','mfa_credentials','legacy_mfa_auth_challenges','legacy_mfa_credentials')`;
    assert.deepEqual(tables.map((row) => row.name).sort(), ['legacy_mfa_auth_challenges', 'legacy_mfa_credentials']);
    const columns = await prisma.$queryRaw`SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='user_sessions'`;
    assert.ok(columns.some((row) => row.name === 'legacyMfaVerifiedAt')); assert.ok(!columns.some((row) => row.name === 'mfaVerifiedAt'));
  });
  it('ADMIN MASTER autentica por senha Argon2id sem desafio, inclusive sem chave de recuperação configurada', async () => {
    assert.match(data.users.admin.passwordHash, /^\$argon2id\$/);
    const local = createApp({ prisma, config: { ...config, authDataEncryptionKey: undefined } });
    const response = await request(local).post('/api/v1/auth/login').send({ email: data.users.admin.emailNormalized, password: data.password });
    assert.equal(response.status, 200); assert.ok(response.body.data.accessToken);
    for (const key of ['mfaRequired', 'challengeToken', 'enrollment', 'recoveryCodes', 'refreshToken']) assert.equal(response.body.data[key], undefined);
    assert.match(response.headers['set-cookie'][0], /HttpOnly/); assert.match(response.headers['set-cookie'][0], /SameSite=Strict/);
    assert.equal((await request(local).get('/api/v1/users').set('authorization', `Bearer ${response.body.data.accessToken}`)).status, 200);
    assert.ok(await prisma.auditEvent.count({ where: { actorId: data.users.admin.id, action: 'LOGIN_SUCCEEDED' } }));
    session = response;
  });
  it('sessão ADMIN renova com rotação, rejeita replay e perde JWT/refresh após logout', async () => {
    const previous = cookie(session);
    const refreshed = await request(app).post('/api/v1/auth/refresh').set('cookie', previous);
    assert.equal(refreshed.status, 200); assert.notEqual(cookie(refreshed), previous);
    assert.equal((await request(app).post('/api/v1/auth/refresh').set('cookie', previous)).status, 401);
    assert.equal((await request(app).post('/api/v1/auth/logout').set('cookie', cookie(refreshed))).status, 204);
    assert.equal((await request(app).get('/api/v1/users').set('authorization', `Bearer ${refreshed.body.data.accessToken}`)).status, 401);
    assert.equal((await request(app).post('/api/v1/auth/refresh').set('cookie', cookie(refreshed))).status, 401);
  });
  it('rotas MFA antigas e variantes não existem, com ou sem autenticação', async () => {
    const access = (await login()).body.data.accessToken;
    for (const path of ['/mfa', '/mfa/verify', '/mfa/enroll', '/mfa/activate', '/mfa/recovery', `/mfa/${data.users.admin.id}`]) {
      for (const method of ['get', 'post', 'delete']) for (const authenticated of [false, true]) {
        const call = request(app)[method](`/api/v1/auth${path}`);
        if (authenticated) call.set('authorization', `Bearer ${access}`);
        assert.equal((await call.send({ challengeToken: 'x'.repeat(64), code: '123456' })).status, 404);
      }
    }
  });
  it('rate limit alcança ADMIN MASTER e falhas não revelam existência da conta', async () => {
    const limited = createApp({ prisma, config: { ...config, loginMaxAttempts: 2 } });
    const failed = await request(limited).post('/api/v1/auth/login').send({ email: data.users.admin.emailNormalized, password: 'Wrong-Password-2026' });
    const unknown = await request(limited).post('/api/v1/auth/login').send({ email: 'unknown@qa9.invalid', password: 'Wrong-Password-2026' });
    assert.equal(failed.status, 401); assert.equal(unknown.status, 401);
    assert.equal(failed.body.error.code, unknown.body.error.code); assert.equal(failed.body.error.message, unknown.body.error.message);
    assert.equal((await request(limited).post('/api/v1/auth/login').send({ email: data.users.admin.emailNormalized, password: data.password })).status, 429);
  });
  it('quatro perfis mantêm permissões, ADMIN sem acesso gerencial e Gestor sem IDOR entre equipes', async () => {
    for (const [role, managerial] of [['admin', false], ['secretary', true], ['manager', true], ['technician', false]]) {
      const response = await login(role); assert.equal(response.status, 200);
      const access = response.body.data.accessToken;
      for (const route of ['/dashboard', '/reports']) assert.equal((await request(app).get(`/api/v1${route}`).set('authorization', `Bearer ${access}`)).status, managerial ? 200 : 403);
    }
    const foreign = await prisma.team.create({ data: { id: randomUUID(), name: `Foreign ${data.run}` } });
    const manager = (await login('manager')).body.data.accessToken;
    assert.equal((await request(app).get(`/api/v1/teams/${foreign.id}`).set('authorization', `Bearer ${manager}`)).status, 404);
    assert.equal((await request(app).post('/api/v1/users').set('authorization', `Bearer ${manager}`).send({ name: 'Forbidden', email: 'forbidden@qa9.invalid', password: data.password, roleCode: 'ADMIN_MASTER' })).status, 403);
  });
  it('recuperação de senha enfileira token cifrado; Nodemailer local entrega link e reset revoga sessões', async () => {
    session = await login(); assert.equal(session.status, 200);
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const sender = createEmailSender({ config: { ...config, mailEnabled: true }, transport: { async sendMail(options) { const result = await transport.sendMail(options); messages.push(JSON.parse(result.message)); return result; } } });
    const outbox = createOutboxService({ emailSender: sender, config });
    const known = await request(app).post('/api/v1/auth/password/forgot').send({ email: data.users.admin.emailNormalized });
    const unknown = await request(app).post('/api/v1/auth/password/forgot').send({ email: 'not-existing@qa9.invalid' });
    assert.equal(known.status, 202); assert.equal(unknown.status, 202); assert.deepEqual(known.body, unknown.body);
    const reset = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: data.users.admin.id, usedAt: null } });
    const event = await prisma.outboxEvent.findUniqueOrThrow({ where: { dedupeKey: `password-reset:${reset.id}` } });
    assert.equal(event.payloadJson.token, undefined); await outbox.processEvent(prisma, event);
    const match = messages.at(-1).text.match(/#token=([A-Za-z0-9_-]+)/); assert.ok(match);
    const token = match[1]; assert.equal(hashOpaqueToken(token), reset.tokenHash); assert.ok(!JSON.stringify(event.payloadJson).includes(token));
    const password = 'Updated-Test-Password-2026';
    const response = await request(app).post('/api/v1/auth/password/reset').send({ token, password }); assert.equal(response.status, 204);
    assert.equal((await request(app).post('/api/v1/auth/password/reset').send({ token, password })).status, 400);
    assert.equal((await request(app).get('/api/v1/users').set('authorization', `Bearer ${session.body.data.accessToken}`)).status, 401);
    session = await login('admin', password); assert.equal(session.status, 200); data.password = password;
    assert.ok(await prisma.auditEvent.count({ where: { actorId: data.users.admin.id, action: 'PASSWORD_RESET_COMPLETED' } }));
    await outbox.processEvent(prisma, event); assert.equal(messages.length, 1);
  });
  it('novo pedido invalida o anterior e token expirado não altera a senha', async () => {
    const forgot = () => request(app).post('/api/v1/auth/password/forgot').send({ email: data.users.technician.emailNormalized });
    assert.equal((await forgot()).status, 202);
    const first = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: data.users.technician.id, usedAt: null } });
    assert.equal((await forgot()).status, 202);
    assert.ok((await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: first.id } })).usedAt);
    const active = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: data.users.technician.id, usedAt: null } });
    const event = await prisma.outboxEvent.findUniqueOrThrow({ where: { dedupeKey: `password-reset:${active.id}` } });
    const { unseal } = await import('../../src/shared/security/auth-secrets.js');
    const token = unseal(event.payloadJson.tokenCiphertext, active.id, config);
    await prisma.passwordResetToken.update({ where: { id: active.id }, data: { createdAt: new Date(Date.now() - 60000), expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await request(app).post('/api/v1/auth/password/reset').send({ token, password: 'Expired-Password-2026' })).status, 400);
    assert.equal((await login('technician', 'Expired-Password-2026')).status, 401);
  });
  it('falha da entrega de recuperação conserva retry e não registra token no erro', async () => {
    await request(app).post('/api/v1/auth/password/forgot').send({ email: data.users.secretary.emailNormalized });
    const reset = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: data.users.secretary.id, usedAt: null } });
    const service = createOutboxService({ config, emailSender: { testMode: false, send: async () => ({ status: 'FAILED', lastError: 'Falha ao enviar e-mail.', sentAt: null }) } });
    const event = await service.claimEvent(prisma, { dedupeKey: `password-reset:${reset.id}` }); assert.ok(event);
    await assert.rejects(() => service.processEvent(prisma, event), /Falha na entrega/);
    await service.completeEvent(prisma, event.id, false, 'Falha na entrega de recuperação.');
    const pending = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    assert.equal(pending.status, 'PENDING'); assert.ok(pending.nextAttemptAt > new Date());
    assert.equal(pending.lastError, 'Falha na entrega de recuperação.');
    const delivery = await prisma.emailDelivery.findFirstOrThrow({ where: { outboxEventId: event.id } });
    assert.equal(delivery.status, 'FAILED'); assert.equal(delivery.attemptCount, 1);
    const disabled = createOutboxService({ config, emailSender: { testMode: true } });
    await assert.rejects(() => disabled.processEvent(prisma, event), /indisponível/);
  });
});
