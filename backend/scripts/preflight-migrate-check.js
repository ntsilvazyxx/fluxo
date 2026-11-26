import mariadb from 'mariadb';

async function preflightCheck() {
  const urlStr = process.env.DATABASE_URL;
  if (!urlStr) {
    console.error('[PREFLIGHT-MIGRATE][ERRO] DATABASE_URL nao informada no ambiente.');
    process.exit(1);
  }

  let url;
  try {
    url = new URL(urlStr);
  } catch {
    console.error('[PREFLIGHT-MIGRATE][ERRO] DATABASE_URL invalida.');
    process.exit(1);
  }

  // 1. Validacao estrita de destino e protocolo
  if (url.protocol !== 'mysql:') {
    console.error('[PREFLIGHT-MIGRATE][ERRO] Protocolo deve ser mysql://.');
    process.exit(1);
  }
  if (url.hostname !== '127.0.0.1') {
    console.error('[PREFLIGHT-MIGRATE][ERRO] Host deve ser estritamente 127.0.0.1.');
    process.exit(1);
  }
  if (Number(url.port || 3306) !== 3306) {
    console.error('[PREFLIGHT-MIGRATE][ERRO] Porta deve ser 3306.');
    process.exit(1);
  }
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (dbName !== 'seaf_gestao_integration_2') {
    console.error(`[PREFLIGHT-MIGRATE][ERRO] Banco nao autorizado: "${dbName}". Destino DEVE ser seaf_gestao_integration_2.`);
    process.exit(1);
  }
  const username = decodeURIComponent(url.username);
  if (username !== 'seaf_it2_migrate') {
    console.error(`[PREFLIGHT-MIGRATE][ERRO] Usuario deve ser seaf_it2_migrate (recebido: "${username}").`);
    process.exit(1);
  }

  // 2. Conexao real na mesma URL
  const conn = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: username,
    password: decodeURIComponent(url.password),
    database: dbName,
    connectTimeout: 5000,
  });

  try {
    const [row] = await conn.query('SELECT CURRENT_USER() AS u, DATABASE() AS db, @@port AS p, VERSION() AS v');
    if (row.db !== 'seaf_gestao_integration_2') {
      throw new Error(`Banco conectado diverge: ${row.db}`);
    }
    if (!row.u.startsWith('seaf_it2_migrate@')) {
      throw new Error(`Usuario conectado diverge: ${row.u}`);
    }

    const tables = await conn.query('SHOW TABLES');
    if (tables.length !== 0) {
      throw new Error(`O banco seaf_gestao_integration_2 nao esta vazio! Contem ${tables.length} tabelas.`);
    }

    console.info(JSON.stringify({
      status: 'APROVADO',
      servidor: row.v,
      porta: Number(row.p),
      usuarioConectado: row.u,
      bancoAtivo: row.db,
      totalTabelas: tables.length,
      prontoParaMigracao: true,
    }, null, 2));
  } finally {
    await conn.end();
  }
}

preflightCheck().catch((err) => {
  console.error('[PREFLIGHT-MIGRATE][ERRO]', err.message);
  process.exit(1);
});
