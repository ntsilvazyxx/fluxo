import { createPrismaClient } from '../src/infrastructure/database/prisma.js';

export async function verifyHomologationDatabase(url = 'mysql://root:@127.0.0.1:3306/seaf_chat_homologation') {
  const client = createPrismaClient(url);

  try {
    const [dbInfo] = await client.$queryRawUnsafe('SELECT DATABASE() as current_db, VERSION() as version, @@port as port');
    
    if (dbInfo.current_db !== 'seaf_chat_homologation') {
      throw new Error(`PERIGO: Banco selecionado é "${dbInfo.current_db}", mas deveria ser "seaf_chat_homologation"! Abortando para proteger o ambiente.`);
    }

    const [tablesRow] = await client.$queryRawUnsafe(
      "SELECT count(*) as count FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'seaf_chat_homologation'"
    );

    const [triggersRow] = await client.$queryRawUnsafe(
      "SELECT count(*) as count FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = 'seaf_chat_homologation'"
    );

    const [chatMessagesRow] = await client.$queryRawUnsafe("SELECT count(*) as count FROM chat_messages");
    const [tasksRow] = await client.$queryRawUnsafe("SELECT count(*) as count FROM tasks");

    // Confirmação de que o banco operacional seaf_gestao_functional está intocado
    const [opDbCheck] = await client.$queryRawUnsafe(
      "SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'seaf_gestao_functional'"
    );

    return {
      connected: true,
      database: dbInfo.current_db,
      version: dbInfo.version,
      port: Number(dbInfo.port),
      tableCount: Number(tablesRow.count),
      triggerCount: Number(triggersRow.count),
      chatMessagesCount: Number(chatMessagesRow.count),
      tasksCount: Number(tasksRow.count),
      operationalDbIntact: Number(opDbCheck.count) === 42,
    };
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1]?.endsWith('verify-homologation-db.js')) {
  verifyHomologationDatabase()
    .then((res) => {
      console.log('CONFIRMAÇÃO PROGRAMÁTICA DO BANCO DE HOMOLOGAÇÃO:');
      console.log(JSON.stringify(res, null, 2));
    })
    .catch((err) => {
      console.error('FALHA NA VERIFICAÇÃO:', err);
      process.exit(1);
    });
}
