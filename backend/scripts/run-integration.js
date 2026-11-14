import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { openGuardedIntegration, validateIntegrationEnvironment } from './integration-guard.js';

const url = validateIntegrationEnvironment(process.env);
const checked = await openGuardedIntegration();
await checked.$disconnect();
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'test/integration/*.test.js'], {
  stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: url, TEST_DATABASE_URL: url, MAIL_ENABLED: '0', JWT_ACCESS_SECRET: randomBytes(48).toString('hex'), AUTH_DATA_ENCRYPTION_KEY: randomBytes(32).toString('hex') },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
