import { openGuardedIntegration, selectedIntegrationDatabase } from './integration-guard.js';

async function runPreflight() {
  const selectedName = selectedIntegrationDatabase(process.env);
  console.info(`[PREFLIGHT-GUARD] Iniciando validação estrita sem escrita no banco "${selectedName}"...`);

  const client = await openGuardedIntegration();
  try {
    const [info] = await client.$queryRawUnsafe('SELECT CURRENT_USER() AS u, DATABASE() AS db, VERSION() AS v');
    const databases = await client.$queryRawUnsafe('SHOW DATABASES');
    const visible = databases.map((r) => Object.values(r)[0]);

    console.info(JSON.stringify({
      status: 'APROVADO',
      usuarioEfetivo: info.u,
      bancoAtivo: info.db,
      versaoServidor: info.v,
      schemasVisiveis: visible,
      guardiaoPreflight: 'SUCESSO - Todos os checks de isolamento, histórico e probes sintéticos aprovados.',
    }, null, 2));
  } finally {
    await client.$disconnect();
  }
}

runPreflight().catch((err) => {
  console.error('[PREFLIGHT-GUARD][BLOQUEIO]', err.message);
  process.exit(1);
});
