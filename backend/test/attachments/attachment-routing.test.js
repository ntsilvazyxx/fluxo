import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('contrato HTTP de anexos sem banco', () => {
  const app = () => createApp({ prisma: {}, startOutboxWorker: false, config: { mailEnabled: false } });
  it('expõe o prefixo existente e exige autenticação antes de receber arquivo ou consultar dados', async () => {
    for (const [method, path] of [
      ['post', '/task-uploads/staged'], ['get', '/task-uploads/tasks/00000000-0000-4000-8000-000000000001'],
      ['get', '/task-uploads/00000000-0000-4000-8000-000000000001/content'],
      ['post', '/task-uploads/tasks/00000000-0000-4000-8000-000000000001/attachments'],
    ]) {
      const response = await request(app())[method](`/api/v1${path}`);
      assert.equal(response.status, 401); assert.equal(response.body.error.code, 'AUTHENTICATION_REQUIRED');
    }
  });
  it('não altera a API para criar alias do prefixo incorreto', async () => {
    assert.equal((await request(app()).post('/api/v1/attachments/staged')).status, 404);
  });
  it('impede reintroduzir o prefixo antigo nas chamadas da campanha', () => {
    const source = readFileSync(new URL('../integration/attachments.test.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?:\/api\/v1\/attachments\/|`\/attachments\/)/);
    assert.ok(source.includes('/api/v1/task-uploads/staged'));
    assert.ok(source.includes('/task-uploads/tasks/${task.id}/attachments'));
  });
});
