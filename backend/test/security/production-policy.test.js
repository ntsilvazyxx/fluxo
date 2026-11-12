import assert from 'node:assert/strict';
import { it } from 'node:test';
import { validateProductionConfig } from '../../src/config/production-policy.js';
const valid = { nodeEnv: 'production', jwtAccessSecret: 'a'.repeat(64), authDataEncryptionKey: 'b'.repeat(64), cookieSecure: true, corsOrigins: ['https://seaf.example.invalid'], appBaseUrl: 'https://seaf.example.invalid' };
it('recusa configuração insegura em produção sem alterar desenvolvimento', () => {
  validateProductionConfig(valid);
  validateProductionConfig({ nodeEnv: 'development' });
  for (const change of [{ jwtAccessSecret: 'short' }, { cookieSecure: false }, { corsOrigins: ['http://localhost'] }, { appBaseUrl: 'http://localhost' }, { corsOrigins: [] }]) {
    assert.throws(() => validateProductionConfig({ ...valid, ...change }));
  }
});
