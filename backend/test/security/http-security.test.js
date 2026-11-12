import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';

const config = { corsOrigins: ['http://localhost:5173'], jwtAccessSecret: 'qa9-unit-secret-at-least-thirty-two-bytes', loginWindowMinutes: 15, loginMaxAttempts: 2, cookieSecure: true, refreshTokenTtlDays: 1, mailEnabled: false };
const app = () => createApp({ prisma: {}, config });
describe('segurança HTTP', () => {
  it('recusa Origin não autorizado antes dos endpoints, inclusive refresh/logout', async () => {
    for (const route of ['/auth/refresh', '/auth/logout', '/auth/login']) {
      const response = await request(app()).post(`/api/v1${route}`).set('Origin', 'https://evil.invalid').send({});
      assert.equal(response.status, 403);
      assert.equal(response.body.error.code, 'ORIGIN_NOT_ALLOWED');
      assert.ok(response.body.error.correlationId);
      assert.equal(response.headers['access-control-allow-origin'], undefined);
    }
  });
  it('aplica CORS permitido, headers seguros e não anuncia Express', async () => {
    const response = await request(app()).get('/api/v1/health').set('Origin', config.corsOrigins[0]);
    assert.equal(response.status, 200);
    assert.equal(response.headers['access-control-allow-origin'], config.corsOrigins[0]);
    assert.equal(response.headers['access-control-allow-credentials'], 'true');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.ok(response.headers['content-security-policy']);
    assert.ok(response.headers['strict-transport-security']);
    assert.equal(response.headers['x-powered-by'], undefined);
  });
  it('retorna 400 para JSON inválido sem refletir conteúdo enviado', async () => {
    const response = await request(app()).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"password":"private-value",');
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'INVALID_JSON');
    assert.ok(!response.text.includes('private-value'));
  });
  it('limita tamanho de JSON com 413', async () => {
    const response = await request(app()).post('/api/v1/auth/login').send({ text: 'x'.repeat(1_100_000) });
    assert.equal(response.status, 413);
    assert.equal(response.body.error.code, 'PAYLOAD_TOO_LARGE');
  });
  it('limita tentativas e retorna 429', async () => {
    const instance = app();
    for (let i = 0; i < 2; i++) assert.equal((await request(instance).post('/api/v1/auth/login').send({})).status, 400);
    assert.equal((await request(instance).post('/api/v1/auth/login').send({})).status, 429);
  });
  it('não registra mensagem, stack, query ou payload de falha interna', () => {
    const logs = mock.method(console, 'error', () => {});
    try {
      let body;
      errorHandler(Object.assign(new Error('secret-password SELECT users'), { code: 'DB_DOWN' }), { correlationId: 'qa9-correlation' }, {
        status(code) { assert.equal(code, 500); return this; }, json(value) { body = value; },
      });
      const output = logs.mock.calls[0].arguments.join('');
      assert.ok(!output.includes('secret-password'));
      assert.ok(!output.includes('SELECT'));
      assert.ok(output.includes('qa9-correlation'));
      assert.equal(body.error.code, 'INTERNAL_SERVER_ERROR');
    } finally { logs.mock.restore(); }
  });
});
