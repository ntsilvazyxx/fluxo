import mariadb from 'mariadb';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { parseDatabaseUrl, createPrismaClient } from '../src/infrastructure/database/prisma.js';
import { validateIntegrationEnvironment, WRITABLE_INTEGRATION_DATABASE } from './integration-guard.js';

async function runDiagnostic() {
  const results = {
    ambienteValido: false,
    analiseUrl: {},
    caminhoA_mariadbConnectionDireto: { executado: false, sucesso: false, erro: null },
    caminhoB_mariadbConnectionComParse: { executado: false, sucesso: false, erro: null },
    caminhoC_mariadbPoolComParse: { executado: false, sucesso: false, erro: null },
    caminhoD_adapterMariadbObjeto: { executado: false, sucesso: false, erro: null },
    caminhoE_adapterMariadbString: { executado: false, sucesso: false, erro: null },
    caminhoF_prismaClientCompleto: { executado: false, sucesso: false, erro: null },
    caminhoG_guardiaoValidacao: { executado: false, sucesso: false, erro: null },
    conclusaoDiagnostico: null,
  };

  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    console.error(JSON.stringify({ erro: 'DATABASE_URL não informada no ambiente.' }, null, 2));
    process.exit(1);
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    console.error(JSON.stringify({ erro: `DATABASE_URL inválida: ${err.message}` }, null, 2));
    process.exit(1);
  }

  if (parsed.protocol !== 'mysql:' || parsed.hostname !== '127.0.0.1' || Number(parsed.port || 3306) !== 3306) {
    console.error(JSON.stringify({ erro: 'Destino deve ser mysql:// em 127.0.0.1:3306.' }, null, 2));
    process.exit(1);
  }

  const targetDb = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (targetDb !== WRITABLE_INTEGRATION_DATABASE) {
    console.error(JSON.stringify({ erro: `Banco não autorizado: "${targetDb}". Esperado: "${WRITABLE_INTEGRATION_DATABASE}".` }, null, 2));
    process.exit(1);
  }

  const username = decodeURIComponent(parsed.username);
  if (username !== 'seaf_it2_run') {
    console.error(JSON.stringify({ erro: `Usuário deve ser "seaf_it2_run" (recebido: "${username}").` }, null, 2));
    process.exit(1);
  }

  results.ambienteValido = true;

  // Análise estrita de codificação da senha (SEM expor caracteres ou hash)
  const rawPass = parsed.password;
  const decodedOnce = decodeURIComponent(rawPass);
  let decodedTwice = null;
  let doubleDecodeThrows = false;
  try {
    decodedTwice = decodeURIComponent(decodedOnce);
  } catch {
    doubleDecodeThrows = true;
  }

  results.analiseUrl = {
    usuario: username,
    host: parsed.hostname,
    porta: Number(parsed.port || 3306),
    banco: targetDb,
    senhaContemPercent: rawPass.includes('%'),
    comprimentoSenhaOriginal: rawPass.length,
    comprimentoSenhaDecodificada1x: decodedOnce.length,
    comprimentoSenhaDecodificada2x: decodedTwice ? decodedTwice.length : null,
    decodificacaoDuplaAlteraValor: decodedTwice !== null && decodedTwice !== decodedOnce,
    decodificacaoDuplaDisparaErro: doubleDecodeThrows,
  };

  // Caminho A: verify-integration-migrations.js exato (mariadb.createConnection direto)
  try {
    results.caminhoA_mariadbConnectionDireto.executado = true;
    const connA = await mariadb.createConnection({
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: username,
      password: decodeURIComponent(parsed.password),
      database: targetDb,
      connectTimeout: 5000,
    });
    try {
      const [row] = await connA.query('SELECT CURRENT_USER() AS u, DATABASE() AS db');
      results.caminhoA_mariadbConnectionDireto.sucesso = true;
      results.caminhoA_mariadbConnectionDireto.usuarioEfetivo = row.u;
      results.caminhoA_mariadbConnectionDireto.bancoEfetivo = row.db;
    } finally {
      await connA.end();
    }
  } catch (err) {
    results.caminhoA_mariadbConnectionDireto.erro = {
      message: err.message,
      errno: err.errno,
      code: err.code,
      sqlState: err.sqlState,
    };
  }

  // Caminho B: mariadb.createConnection via parseDatabaseUrl()
  try {
    results.caminhoB_mariadbConnectionComParse.executado = true;
    const configParsed = parseDatabaseUrl(rawUrl);
    const connB = await mariadb.createConnection({
      ...configParsed,
      connectTimeout: 5000,
    });
    try {
      const [row] = await connB.query('SELECT CURRENT_USER() AS u, DATABASE() AS db');
      results.caminhoB_mariadbConnectionComParse.sucesso = true;
      results.caminhoB_mariadbConnectionComParse.usuarioEfetivo = row.u;
      results.caminhoB_mariadbConnectionComParse.bancoEfetivo = row.db;
    } finally {
      await connB.end();
    }
  } catch (err) {
    results.caminhoB_mariadbConnectionComParse.erro = {
      message: err.message,
      errno: err.errno,
      code: err.code,
      sqlState: err.sqlState,
    };
  }

  // Caminho C: mariadb.createPool() direto com parseDatabaseUrl()
  try {
    results.caminhoC_mariadbPoolComParse.executado = true;
    const configParsed = parseDatabaseUrl(rawUrl);
    const pool = mariadb.createPool({
      ...configParsed,
      connectionLimit: 1,
      acquireTimeout: 5000,
    });
    try {
      const [row] = await pool.query('SELECT CURRENT_USER() AS u, DATABASE() AS db');
      results.caminhoC_mariadbPoolComParse.sucesso = true;
      results.caminhoC_mariadbPoolComParse.usuarioEfetivo = row.u;
      results.caminhoC_mariadbPoolComParse.bancoEfetivo = row.db;
    } finally {
      await pool.end();
    }
  } catch (err) {
    results.caminhoC_mariadbPoolComParse.erro = {
      message: err.message,
      errno: err.errno,
      code: err.code,
      sqlState: err.sqlState,
    };
  }

  // Caminho D: PrismaMariaDb Adapter instanciado com Objeto (como faz prisma.js atualmente)
  try {
    results.caminhoD_adapterMariadbObjeto.executado = true;
    const configParsed = parseDatabaseUrl(rawUrl);
    const factory = new PrismaMariaDb({
      ...configParsed,
      connectionLimit: 1,
      acquireTimeout: 5000,
    });
    const adapter = await factory.connect();
    try {
      const queryResult = await adapter.queryRaw({
        sql: 'SELECT CURRENT_USER() AS u, DATABASE() AS db',
        args: [],
        argTypes: [],
      });
      results.caminhoD_adapterMariadbObjeto.sucesso = true;
      results.caminhoD_adapterMariadbObjeto.rowsCount = queryResult.rows.length;
    } finally {
      await adapter.dispose();
    }
  } catch (err) {
    results.caminhoD_adapterMariadbObjeto.erro = {
      message: err.message,
      errno: err.errno,
      code: err.code,
    };
  }

  // Caminho E: PrismaMariaDb Adapter instanciado diretamente com String URL
  try {
    results.caminhoE_adapterMariadbString.executado = true;
    const factoryStr = new PrismaMariaDb(rawUrl);
    const adapterStr = await factoryStr.connect();
    try {
      const queryResult = await adapterStr.queryRaw({
        sql: 'SELECT CURRENT_USER() AS u, DATABASE() AS db',
        args: [],
        argTypes: [],
      });
      results.caminhoE_adapterMariadbString.sucesso = true;
      results.caminhoE_adapterMariadbString.rowsCount = queryResult.rows.length;
    } finally {
      await adapterStr.dispose();
    }
  } catch (err) {
    results.caminhoE_adapterMariadbString.erro = {
      message: err.message,
      errno: err.errno,
      code: err.code,
    };
  }

  // Caminho F: createPrismaClient() e $queryRawUnsafe (Prisma Client completo)
  try {
    results.caminhoF_prismaClientCompleto.executado = true;
    const client = createPrismaClient(rawUrl, { connectionLimit: 1, acquireTimeout: 5000 });
    try {
      const rows = await client.$queryRawUnsafe('SELECT CURRENT_USER() AS u, DATABASE() AS db');
      results.caminhoF_prismaClientCompleto.sucesso = true;
      results.caminhoF_prismaClientCompleto.rowsCount = Array.isArray(rows) ? rows.length : 0;
    } finally {
      await client.$disconnect();
    }
  } catch (err) {
    results.caminhoF_prismaClientCompleto.erro = {
      message: err.message,
      code: err.code,
      meta: err.meta,
    };
  }

  // Caminho G: Validação de ambiente do guardião (validateIntegrationEnvironment)
  try {
    results.caminhoG_guardiaoValidacao.executado = true;
    const validatedUrl = validateIntegrationEnvironment(process.env);
    const dbHref = new URL(validatedUrl);
    results.caminhoG_guardiaoValidacao.sucesso = true;
    results.caminhoG_guardiaoValidacao.reencodedMatch = (validatedUrl === rawUrl);
    results.caminhoG_guardiaoValidacao.hrefSemParametros = (dbHref.search === '' && dbHref.hash === '');
  } catch (err) {
    results.caminhoG_guardiaoValidacao.erro = {
      message: err.message,
    };
  }

  // Análise conclusiva
  const aOk = results.caminhoA_mariadbConnectionDireto.sucesso;
  const bOk = results.caminhoB_mariadbConnectionComParse.sucesso;
  const cOk = results.caminhoC_mariadbPoolComParse.sucesso;
  const dOk = results.caminhoD_adapterMariadbObjeto.sucesso;
  const eOk = results.caminhoE_adapterMariadbString.sucesso;
  const fOk = results.caminhoF_prismaClientCompleto.sucesso;

  if (aOk && bOk && cOk && dOk && fOk) {
    results.conclusaoDiagnostico = 'TODOS OS CAMINHOS CONECTAM COM SUCESSO. A credencial atual é válida em todos os níveis.';
  } else if (aOk && !cOk) {
    results.conclusaoDiagnostico = 'DIVERGENCIA: mariadb.createConnection funciona, mas mariadb.createPool falha. Investigar pool-options.';
  } else if (aOk && cOk && !dOk && eOk) {
    results.conclusaoDiagnostico = 'DIVERGENCIA CONFIRMADA: PrismaMariaDb com objeto falha, mas com string URL conecta com sucesso.';
  } else if (aOk && cOk && !dOk) {
    results.conclusaoDiagnostico = 'DIVERGENCIA: Driver mariadb funciona, mas PrismaMariaDb com objeto falha. Verificar adapter-mariadb.';
  } else if (aOk && dOk && !fOk) {
    results.conclusaoDiagnostico = 'DIVERGENCIA: Adapter funciona, mas PrismaClient falha. Investigar inicialização do engine Prisma.';
  } else if (!aOk) {
    results.conclusaoDiagnostico = 'FALHA DE AUTENTICACAO DESDE O DRIVER NATIVO (Caminho A). A credencial fornecida está incorreta no MariaDB.';
  } else {
    results.conclusaoDiagnostico = 'DIVERGENCIA DETECTADA. Analise o detalhamento por caminho acima.';
  }

  console.info(JSON.stringify(results, null, 2));
}

runDiagnostic().catch((err) => {
  console.error(JSON.stringify({ erroFatal: err.message }, null, 2));
  process.exit(1);
});
