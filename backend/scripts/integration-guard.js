import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const INTEGRATION_DATABASE = 'seaf_gestao_integration';
export const MIGRATION_NAMES = [
  '20261111170000_init_persistence', '20261111171000_add_integrity_constraints',
  '20261112110000_calendar_history_guards', '20261112233000_auth_mfa_sessions',
  '20261113001000_retire_mfa_preserve_history', '20261113120000_running_clock_attachments',
];
const fail = (message) => { throw new Error(`Integração bloqueada: ${message}`); };
function target(value) {
  let url;
  try { url = new URL(value); } catch { fail('URL explícita inválida.'); }
  if (url.protocol !== 'mysql:' || url.hostname !== '127.0.0.1' || url.port !== '3306' || url.pathname !== `/${INTEGRATION_DATABASE}` || url.search || url.hash || !url.username) {
    fail('destino exclusivo seaf_gestao_integration em 127.0.0.1:3306, sem parâmetros adicionais.');
  }
  return url;
}
export function validateIntegrationEnvironment(environment) {
  if (environment.RUN_DATABASE_INTEGRATION !== '1') fail('exige RUN_DATABASE_INTEGRATION=1 explícito.');
  const database = target(environment.DATABASE_URL);
  const test = target(environment.TEST_DATABASE_URL);
  if (database.href !== test.href) fail('DATABASE_URL e TEST_DATABASE_URL devem ser idênticas.');
  return database.href;
}
export function expectedMigrations() {
  return MIGRATION_NAMES.map((name) => ({ name, checksum: createHash('sha256').update(readFileSync(fileURLToPath(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url)))).digest('hex') }));
}
export async function validateIntegrationConnection(client, migrations = expectedMigrations()) {
  const [server] = await client.$queryRawUnsafe('SELECT DATABASE() AS db, VERSION() AS version, @@port AS port');
  if (server?.db !== INTEGRATION_DATABASE || Number(server.port) !== 3306 || !/^10\.11\.\d+-MariaDB/.test(server.version ?? '')) fail('a conexão real não corresponde ao destino e versão autorizados.');
  const history = await client.$queryRawUnsafe('SELECT migration_name AS name, checksum, finished_at AS finished, rolled_back_at AS rolledBack FROM _prisma_migrations ORDER BY migration_name');
  if (history.length !== migrations.length || migrations.length !== 6) fail('histórico deve conter exatamente as seis migrações autorizadas.');
  for (const migration of migrations) {
    const row = history.find((item) => item.name === migration.name);
    if (!row?.finished || row.rolledBack || row.checksum !== migration.checksum) fail('histórico de migrações incompleto, divergente ou com falha.');
  }
  // Fail closed: the test account cannot have global/other-schema privileges,
  // roles, GRANT OPTION or DDL. Provisioning/migrations use a separate account.
  const grants = await client.$queryRawUnsafe('SHOW GRANTS FOR CURRENT_USER');
  let writable = false;
  for (const row of grants) for (const grant of Object.values(row)) {
    const match = /^GRANT (.+?) ON (.+?) TO /i.exec(String(grant));
    if (!match || /WITH GRANT OPTION|PROXY/i.test(grant)) fail('privilégios não restritos ao banco de integração.');
    if (match[1] === 'USAGE' && match[2] === '*.*') continue;
    if (match[2].replaceAll('`', '').replaceAll('\\_', '_') !== `${INTEGRATION_DATABASE}.*`) fail('conta possui acesso a outro banco ou privilégios globais.');
    const privileges = match[1].split(',').map((value) => value.trim().toUpperCase());
    if (privileges.some((privilege) => !['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(privilege))) fail('conta de testes possui DDL ou privilégio inesperado.');
    writable ||= ['INSERT', 'UPDATE', 'DELETE'].every((privilege) => privileges.includes(privilege)) && privileges.includes('SELECT');
  }
  if (!writable) fail('conta precisa de SELECT/INSERT/UPDATE/DELETE exclusivamente no banco descartável.');
  return { database: server.db, version: server.version, migrations: history.length };
}
export async function openGuardedIntegration({ environment = process.env, connect, migrations } = {}) {
  const url = validateIntegrationEnvironment(environment); // Never connect before this check.
  if (!connect) {
    const { createPrismaClient } = await import('../src/infrastructure/database/prisma.js');
    connect = (value) => createPrismaClient(value);
  }
  const client = await connect(url);
  try { await validateIntegrationConnection(client, migrations); return client; }
  catch (error) { await client.$disconnect(); throw error; }
}
