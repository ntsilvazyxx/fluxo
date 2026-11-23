import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createPrismaClient } from '../src/infrastructure/database/prisma.js';
import {
  assertChatHomologationDatabase,
  getChatHomologationDatabaseUrl,
} from '../testing/chat-homologation-guard.js';
import { createChatAttachmentReconciliationService } from '../src/modules/chat/chat-attachment-reconciliation.service.js';
import { createLocalChatAttachmentStorage } from '../src/modules/chat/chat-attachment.local-storage.js';

const rootEnv = path.resolve(import.meta.dirname, '../../.env.homologation.local');
const localEnv = path.resolve(import.meta.dirname, '../.env.homologation.local');
if (existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
} else if (existsSync(localEnv)) {
  dotenv.config({ path: localEnv });
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 && args[limitIndex + 1] ? Number.parseInt(args[limitIndex + 1], 10) : 50;
const timeoutIndex = args.indexOf('--timeout');
const timeoutMs = timeoutIndex !== -1 && args[timeoutIndex + 1] ? Number.parseInt(args[timeoutIndex + 1], 10) : 60_000;

async function main() {
  let databaseUrl;
  try {
    databaseUrl = getChatHomologationDatabaseUrl();
  } catch (error) {
    console.error(`Execução de reconciliação recusada pelos guards de segurança: ${error.message}`);
    process.exit(1);
  }

  const prisma = createPrismaClient(databaseUrl);

  try {
    const homologationInfo = await assertChatHomologationDatabase(prisma);
    console.info(`[Reconciliação Chat] Ambiente verificado com sucesso:`);
    console.info(`  Banco: ${homologationInfo.database}`);
    console.info(`  Versão: ${homologationInfo.version}`);
    console.info(`  Usuário: ${homologationInfo.currentUser}`);
    console.info(`  Modo: ${dryRun ? 'DRY-RUN (Simulação)' : 'EXECUÇÃO REAL'}`);
    console.info(`  Limite: ${limit}`);
    console.info(`  Timeout: ${timeoutMs}ms`);

    const storageRoot = process.env.CHAT_STORAGE_PATH
      || path.resolve(import.meta.dirname, '../.tmp/chat-storage-homologation');
    const storage = createLocalChatAttachmentStorage({ rootPath: storageRoot });

    const reconciliationService = createChatAttachmentReconciliationService({
      prisma,
      storage,
    });

    const report = await reconciliationService.runFullReconciliation({
      dryRun,
      limit,
      timeoutMs,
    });

    console.info('\n[Relatório de Reconciliação]');
    console.info(JSON.stringify(report, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('\n[Erro na Reconciliação do Chat]', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
