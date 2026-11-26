import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import mariadb from 'mariadb';

async function deployMigrations() {
  const urlStr = process.env.DATABASE_URL;
  if (!urlStr) {
    console.error('[DEPLOY-MIGRATE][ERRO] DATABASE_URL nao informada no ambiente.');
    process.exit(1);
  }

  let url;
  try {
    url = new URL(urlStr);
  } catch {
    console.error('[DEPLOY-MIGRATE][ERRO] DATABASE_URL invalida.');
    process.exit(1);
  }

  // 1. Validacao fail-closed da URL
  if (url.protocol !== 'mysql:') {
    console.error('[DEPLOY-MIGRATE][ERRO] Protocolo deve ser mysql://.');
    process.exit(1);
  }
  if (url.hostname !== '127.0.0.1') {
    console.error('[DEPLOY-MIGRATE][ERRO] Host deve ser estritamente 127.0.0.1.');
    process.exit(1);
  }
  if (Number(url.port || 3306) !== 3306) {
    console.error('[DEPLOY-MIGRATE][ERRO] Porta deve ser 3306.');
    process.exit(1);
  }
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (dbName !== 'seaf_gestao_integration_2') {
    console.error(`[DEPLOY-MIGRATE][ERRO] Banco nao autorizado: "${dbName}". Destino DEVE ser seaf_gestao_integration_2.`);
    process.exit(1);
  }
  const username = decodeURIComponent(url.username);
  if (username !== 'seaf_it2_migrate') {
    console.error(`[DEPLOY-MIGRATE][ERRO] Usuario deve ser seaf_it2_migrate (recebido: "${username}").`);
    process.exit(1);
  }

  // 2. Validacao ativa da conexao e banco vazio
  const conn = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: username,
    password: decodeURIComponent(url.password),
    database: dbName,
    connectTimeout: 5000,
  });

  try {
    const [row] = await conn.query('SELECT CURRENT_USER() AS u, DATABASE() AS db, VERSION() AS v');
    if (row.db !== 'seaf_gestao_integration_2') {
      throw new Error(`Banco conectado diverge: ${row.db}`);
    }
    if (!row.u.startsWith('seaf_it2_migrate@')) {
      throw new Error(`Usuario conectado diverge: ${row.u}`);
    }

    const tables = await conn.query('SHOW TABLES');
    if (tables.length !== 0) {
      throw new Error(`O banco seaf_gestao_integration_2 ja possui ${tables.length} tabelas. Migracao abortada por seguranca.`);
    }

    console.info('[DEPLOY-MIGRATE] Pre-voo validado: 127.0.0.1:3306 / seaf_gestao_integration_2 / zero tabelas.');
    console.info('[DEPLOY-MIGRATE] Executando prisma migrate deploy com prisma.integration.config.js...');
  } finally {
    await conn.end();
  }

  // 3. Disparo estrito do Prisma usando process.execPath e a CLI local já instalada
  const prismaCliPath = fileURLToPath(new URL('../../node_modules/prisma/build/index.js', import.meta.url));
  if (!existsSync(prismaCliPath)) {
    throw new Error(`CLI local do Prisma nao encontrada em: ${prismaCliPath}`);
  }

  const result = spawnSync(
    process.execPath,
    [prismaCliPath, 'migrate', 'deploy', '--config', 'prisma.integration.config.js'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: urlStr,
      },
    }
  );

  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
}

deployMigrations().catch((err) => {
  console.error('[DEPLOY-MIGRATE][FALHA BLOQUEADA]', err.message);
  process.exit(1);
});
