import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { it } from 'node:test';
it('runner de integração recusa banco de desenvolvimento antes de abrir conexão', () => {
  const result = spawnSync(process.execPath, ['scripts/run-integration.js'], { encoding: 'utf8', env: {
    ...process.env, RUN_DATABASE_INTEGRATION: '1', TEST_DATABASE_URL: 'mysql://invalid@127.0.0.1:1/seaf_gestao_dev',
  } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /destino exclusivo seaf_gestao_test/);
});
