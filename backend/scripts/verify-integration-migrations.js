import mariadb from 'mariadb';
import { expectedMigrations, MIGRATION_NAMES } from './integration-guard.js';

async function verifyMigrations() {
  const urlStr = process.env.DATABASE_URL;
  if (!urlStr) {
    console.error('[VERIFY-MIGRATE][ERRO] DATABASE_URL nao informada no ambiente.');
    process.exit(1);
  }

  let url;
  try {
    url = new URL(urlStr);
  } catch {
    console.error('[VERIFY-MIGRATE][ERRO] DATABASE_URL invalida.');
    process.exit(1);
  }

  if (url.protocol !== 'mysql:' || url.hostname !== '127.0.0.1' || Number(url.port || 3306) !== 3306) {
    console.error('[VERIFY-MIGRATE][ERRO] Destino deve ser mysql:// em 127.0.0.1:3306.');
    process.exit(1);
  }

  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (dbName !== 'seaf_gestao_integration_2') {
    console.error(`[VERIFY-MIGRATE][ERRO] Banco nao autorizado: "${dbName}".`);
    process.exit(1);
  }

  const username = decodeURIComponent(url.username);
  if (!['seaf_it2_run', 'seaf_it2_migrate'].includes(username)) {
    console.error(`[VERIFY-MIGRATE][ERRO] Usuario deve ser seaf_it2_run ou seaf_it2_migrate (recebido: "${username}").`);
    process.exit(1);
  }

  const conn = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: username,
    password: decodeURIComponent(url.password),
    database: dbName,
    connectTimeout: 5000,
  });

  try {
    const [info] = await conn.query('SELECT CURRENT_USER() AS u, DATABASE() AS db, VERSION() AS v');
    const tables = await conn.query('SHOW TABLES');
    const migrations = await conn.query(
      'SELECT migration_name AS name, checksum, finished_at AS finished, rolled_back_at AS rolledBack FROM _prisma_migrations ORDER BY migration_name'
    );

    const expected = expectedMigrations();
    const comparison = [];
    let allValid = true;

    for (const exp of expected) {
      const found = migrations.find((m) => m.name === exp.name);
      const isOk = Boolean(found && found.finished && !found.rolledBack && found.checksum === exp.checksum);
      if (!isOk) allValid = false;
      comparison.push({
        name: exp.name,
        applied: Boolean(found),
        finished: Boolean(found?.finished),
        rolledBack: Boolean(found?.rolledBack),
        checksumMatch: found?.checksum === exp.checksum,
      });
    }

    const unexpected = migrations.filter((m) => !MIGRATION_NAMES.includes(m.name));
    if (unexpected.length > 0) allValid = false;

    console.info(JSON.stringify({
      status: allValid && migrations.length === 11 ? 'APROVADO' : 'DIVERGENCIA',
      servidor: info.v,
      usuarioConectado: info.u,
      bancoAtivo: info.db,
      totalTabelas: tables.length,
      totalMigracoesAplicadas: migrations.length,
      esperado: 11,
      todasValidas: allValid,
      migracoesInesperadas: unexpected.length,
      detalhes: comparison,
    }, null, 2));

    if (!allValid || migrations.length !== 11) {
      process.exit(1);
    }
  } finally {
    await conn.end();
  }
}

verifyMigrations().catch((err) => {
  console.error('[VERIFY-MIGRATE][ERRO]', err.message);
  process.exit(1);
});
