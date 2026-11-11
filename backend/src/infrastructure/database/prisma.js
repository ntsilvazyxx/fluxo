import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

export function parseDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL não foi definida.');
  }

  const parsed = new URL(databaseUrl);

  if (parsed.protocol !== 'mysql:') {
    throw new Error('DATABASE_URL deve utilizar o protocolo mysql://.');
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));

  if (!database) {
    throw new Error('DATABASE_URL deve informar o nome do banco.');
  }

  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
  };
}

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL, options = {}) {
  const adapter = new PrismaMariaDb({
    ...parseDatabaseUrl(databaseUrl),
    connectionLimit: options.connectionLimit ?? 5,
    acquireTimeout: options.acquireTimeout ?? 10_000,
  });

  return new PrismaClient({ adapter });
}
