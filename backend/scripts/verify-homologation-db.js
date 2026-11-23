import { createPrismaClient } from '../src/infrastructure/database/prisma.js';
import {
  assertChatHomologationDatabase,
  getChatHomologationDatabaseUrl,
} from '../testing/chat-homologation-guard.js';

const expectedChatTables = [
  'chat_conversations',
  'chat_participants',
  'chat_participation_periods',
  'chat_messages',
  'chat_message_attachments',
  'chat_read_receipts',
  'chat_functional_read_states',
  'chat_lock_states',
  'chat_lock_events',
];

export async function verifyHomologationDatabase(url = process.env.CHAT_HOMOLOGATION_DATABASE_URL) {
  const databaseUrl = getChatHomologationDatabaseUrl({
    ...process.env,
    CHAT_HOMOLOGATION_DATABASE_URL: url,
  });
  const client = createPrismaClient(databaseUrl);

  try {
    const identity = await assertChatHomologationDatabase(client);
    const [portRow] = await client.$queryRawUnsafe('SELECT @@port AS port');
    const [tablesRow] = await client.$queryRawUnsafe(
      "SELECT count(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'seaf_chat_homologation'",
    );
    const [triggersRow] = await client.$queryRawUnsafe(
      "SELECT count(*) AS count FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = 'seaf_chat_homologation'",
    );
    const chatTableRows = await client.$queryRawUnsafe(
      `SELECT TABLE_NAME AS tableName
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = 'seaf_chat_homologation'
         AND TABLE_NAME LIKE 'chat\\_%'
       ORDER BY TABLE_NAME`,
    );
    const [migrationsRow] = await client.$queryRawUnsafe('SELECT count(*) AS count FROM _prisma_migrations');
    const [constraintsRow] = await client.$queryRawUnsafe(
      `SELECT count(*) AS count
       FROM information_schema.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = 'seaf_chat_homologation'
         AND TABLE_NAME LIKE 'chat\\_%'`,
    );
    const [indexesRow] = await client.$queryRawUnsafe(
      `SELECT count(DISTINCT TABLE_NAME, INDEX_NAME) AS count
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = 'seaf_chat_homologation'
         AND TABLE_NAME LIKE 'chat\\_%'`,
    );
    const [chatMessagesRow] = await client.$queryRawUnsafe('SELECT count(*) AS count FROM chat_messages');
    const [tasksRow] = await client.$queryRawUnsafe('SELECT count(*) AS count FROM tasks');
    const chatTables = chatTableRows.map((row) => row.tableName);

    return {
      connected: true,
      database: identity.database,
      version: identity.version,
      port: Number(portRow.port),
      tableCount: Number(tablesRow.count),
      triggerCount: Number(triggersRow.count),
      migrationCount: Number(migrationsRow.count),
      chatTableCount: chatTables.length,
      missingChatTables: expectedChatTables.filter((table) => !chatTables.includes(table)),
      chatConstraintCount: Number(constraintsRow.count),
      chatIndexCount: Number(indexesRow.count),
      chatMessagesCount: Number(chatMessagesRow.count),
      tasksCount: Number(tasksRow.count),
      operationalAccessDenied: identity.operationalAccessDenied,
    };
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1]?.endsWith('verify-homologation-db.js')) {
  verifyHomologationDatabase()
    .then((result) => {
      console.info('CONFIRMAÇÃO PROGRAMÁTICA DO BANCO DE HOMOLOGAÇÃO:');
      console.info(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error('FALHA NA VERIFICAÇÃO:', error.message);
      process.exit(1);
    });
}
