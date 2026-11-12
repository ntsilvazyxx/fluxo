import dotenv from 'dotenv';
import { createPrismaClient, parseDatabaseUrl } from '../backend/src/infrastructure/database/prisma.js';

dotenv.config({ quiet: true });
export function testDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || parseDatabaseUrl(url).database !== 'seaf_gestao_test') {
    throw new Error('Homologação exige TEST_DATABASE_URL com destino exclusivo seaf_gestao_test.');
  }
  return { url, prisma: createPrismaClient(url) };
}

export async function checkDatabase(prisma) {
  const [server] = await prisma.$queryRaw`SELECT DATABASE() AS db, VERSION() AS version`;
  if (server.db !== 'seaf_gestao_test' || !/^10\.11\.\d+-MariaDB/.test(server.version)) {
    throw new Error('Banco ou versão incompatível com a homologação.');
  }
  return server;
}
