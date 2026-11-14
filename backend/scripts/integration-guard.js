import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PRESERVED_INTEGRATION_DATABASE = 'seaf_gestao_integration';
export const WRITABLE_INTEGRATION_DATABASE = 'seaf_gestao_integration_2';
export const INTEGRATION_DATABASES = Object.freeze([PRESERVED_INTEGRATION_DATABASE, WRITABLE_INTEGRATION_DATABASE]);
export const MIGRATION_NAMES = [
  '20261111170000_init_persistence', '20261111171000_add_integrity_constraints',
  '20261112110000_calendar_history_guards', '20261112233000_auth_mfa_sessions',
  '20261113001000_retire_mfa_preserve_history', '20261113120000_running_clock_attachments',
];
const fail = (message) => { throw new Error(`Integração bloqueada: ${message}`); };
const forbiddenDatabaseNames = (probeId) => [
  'test',
  `test_${probeId}`,
  `seaf_guard_unauthorized_${probeId}`,
  'seaf_gestao_dev',
  'seaf_gestao_test',
  'seaf_gestao_recovery',
  PRESERVED_INTEGRATION_DATABASE,
  'mysql',
  'phpmyadmin',
];

function mariaDbErrorNumber(error) {
  const pending = [error];
  const visited = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);

    for (const value of [current.errno, current.originalCode, current.code]) {
      if (value === 1044 || value === '1044' || value === 'ER_DBACCESS_DENIED_ERROR') return 1044;
      if (value === 1049 || value === '1049' || value === 'ER_BAD_DB_ERROR') return 1049;
    }

    for (const key of ['cause', 'meta', 'driverAdapterError', 'originalError', 'error']) {
      if (current[key] && typeof current[key] === 'object') pending.push(current[key]);
    }
  }
  return null;
}

async function probeDatabaseUrl(databaseUrl, databaseName) {
  const [{ default: mariadb }, { parseDatabaseUrl }] = await Promise.all([
    import('mariadb'),
    import('../src/infrastructure/database/prisma.js'),
  ]);
  const connection = await mariadb.createConnection({
    ...parseDatabaseUrl(databaseUrl),
    connectTimeout: 5_000,
  });
  try {
    const [row] = await connection.query('SELECT DATABASE() AS db');
    if (row?.db !== databaseName) throw new Error('O servidor selecionou um schema diferente do probe.');
  } finally {
    await connection.end();
  }
}

async function verifyNoUnexpectedDatabaseAccess(databaseUrl, probeDatabase) {
  const probeId = randomUUID().replaceAll('-', '');
  for (const databaseName of forbiddenDatabaseNames(probeId)) {
    let probeError;
    const probeUrl = new URL(databaseUrl);
    probeUrl.pathname = `/${databaseName}`;
    try {
      await probeDatabase(probeUrl.href, databaseName);
    } catch (error) {
      probeError = error;
    }

    if (!probeError) fail(`a conta de integração acessa o banco não autorizado ${databaseName}.`);
    const errorNumber = mariaDbErrorNumber(probeError);
    if (errorNumber === 1044) continue;
    if (errorNumber === 1049) {
      fail(`o probe de ${databaseName} retornou 1049; o banco pode não existir apesar de a conta ter passado pela verificação de acesso.`);
    }
    fail(`o probe de ${databaseName} falhou com erro inesperado; acesso não autorizado não pôde ser descartado.`);
  }
}

export function selectedIntegrationDatabase(environment) {
  const name = environment.INTEGRATION_DATABASE_NAME;
  if (!INTEGRATION_DATABASES.includes(name)) fail('INTEGRATION_DATABASE_NAME deve selecionar explicitamente um dos dois nomes autorizados.');
  return name;
}
function target(value, selectedName) {
  let url;
  try { url = new URL(value); } catch { fail('URL explícita inválida.'); }
  if (url.protocol !== 'mysql:' || url.hostname !== '127.0.0.1' || url.port !== '3306' || url.pathname !== `/${selectedName}` || url.search || url.hash || !url.username) {
    fail(`destino exclusivo ${selectedName} em 127.0.0.1:3306, sem parâmetros adicionais.`);
  }
  return url;
}
export function validateIntegrationEnvironment(environment) {
  if (environment.RUN_DATABASE_INTEGRATION !== '1') fail('exige RUN_DATABASE_INTEGRATION=1 explícito.');
  const selectedName = selectedIntegrationDatabase(environment);
  const database = target(environment.DATABASE_URL, selectedName);
  const test = target(environment.TEST_DATABASE_URL, selectedName);
  if (database.href !== test.href) fail('DATABASE_URL e TEST_DATABASE_URL devem ser idênticas.');
  return database.href;
}
export function writableIntegrationDatabase(environment) {
  validateIntegrationEnvironment(environment);
  const name = selectedIntegrationDatabase(environment);
  if (name === PRESERVED_INTEGRATION_DATABASE) fail('primeira campanha preservada; escrita e reutilização de seaf_gestao_integration proibidas.');
  return name;
}
export function expectedMigrations() {
  return MIGRATION_NAMES.map((name) => ({ name, checksum: createHash('sha256').update(readFileSync(fileURLToPath(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url)))).digest('hex') }));
}
export async function validateIntegrationConnection(client, migrations = expectedMigrations(), selectedName) {
  selectedIntegrationDatabase({ INTEGRATION_DATABASE_NAME: selectedName });
  const [server] = await client.$queryRawUnsafe('SELECT DATABASE() AS db, VERSION() AS version, @@port AS port');
  if (server?.db !== selectedName || Number(server.port) !== 3306 || !/^10\.11\.\d+-MariaDB/.test(server.version ?? '')) fail('a conexão real não corresponde ao destino e versão autorizados.');
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
    const scope = match[2].replaceAll('`', '');
    const literalScope = `${selectedName.replaceAll('_', '\\_')}.*`;
    // SHOW GRANTS may quote the escape itself. Neither form may use bare '_' or '%'.
    if (![literalScope, literalScope.replaceAll('\\', '\\\\')].includes(scope)) fail('conta possui acesso a outro banco, escopo não literal ou privilégios globais.');
    const privileges = match[1].split(',').map((value) => value.trim().toUpperCase());
    if (privileges.some((privilege) => !['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(privilege))) fail('conta de testes possui DDL ou privilégio inesperado.');
    writable ||= ['INSERT', 'UPDATE', 'DELETE'].every((privilege) => privileges.includes(privilege)) && privileges.includes('SELECT');
  }
  if (!writable) fail('conta precisa de SELECT/INSERT/UPDATE/DELETE exclusivamente no banco descartável.');
  return { database: server.db, version: server.version, migrations: history.length };
}
export async function openGuardedIntegration({ environment = process.env, connect, migrations, probeDatabase = probeDatabaseUrl } = {}) {
  const url = validateIntegrationEnvironment(environment); // Never connect before this check.
  if (!connect) {
    const { createPrismaClient } = await import('../src/infrastructure/database/prisma.js');
    connect = (value) => createPrismaClient(value);
  }
  const client = await connect(url);
  try {
    await validateIntegrationConnection(client, migrations, selectedIntegrationDatabase(environment));
    await verifyNoUnexpectedDatabaseAccess(url, probeDatabase);
    return client;
  }
  catch (error) { await client.$disconnect(); throw error; }
}
