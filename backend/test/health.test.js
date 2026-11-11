import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import request from 'supertest';

import { createApp } from '../src/app.js';

describe('GET /api/v1/health', () => {
  it('informa que a API está disponível no contrato padrão', async () => {
    const response = await request(createApp()).get('/api/v1/health');

    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, 'ok');
    assert.equal(response.body.data.service, 'seaf-api');
    assert.equal(response.headers['x-powered-by'], undefined);
  });
});

describe('rota inexistente', () => {
  it('retorna erro estruturado', async () => {
    const response = await request(createApp()).get('/api/v1/inexistente');

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'ROUTE_NOT_FOUND');
  });
});
