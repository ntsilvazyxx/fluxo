import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { parseDatabaseUrl } from '../src/infrastructure/database/prisma.js';

if (process.env.RUN_DATABASE_INTEGRATION !== '1') throw new Error('Integração exige RUN_DATABASE_INTEGRATION=1 explícito.');
const url = process.env.TEST_DATABASE_URL;
if (!url || parseDatabaseUrl(url).database !== 'seaf_gestao_test') throw new Error('Integração exige destino exclusivo seaf_gestao_test.');
const result = spawnSync(process.execPath, ['--test', 'test/integration/*.test.js'], {
  stdio: 'inherit', env: { ...process.env, DATABASE_URL: url, MAIL_ENABLED: '0', AUTH_DATA_ENCRYPTION_KEY: process.env.AUTH_DATA_ENCRYPTION_KEY || randomBytes(32).toString('hex') },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
