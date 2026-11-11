import { createPrismaClient, parseDatabaseUrl } from '../src/infrastructure/database/prisma.js';

const connection = parseDatabaseUrl(process.env.DATABASE_URL);
const prisma = createPrismaClient(process.env.DATABASE_URL, { connectionLimit: 1 });

try {
  const [server] = await prisma.$queryRaw`SELECT VERSION() AS version, @@version_comment AS comment`;
  const versionMatch = /^(\d+)\.(\d+)\.(\d+)-MariaDB/i.exec(server.version);
  const compatible = Boolean(
    versionMatch &&
      (Number(versionMatch[1]) > 10 ||
        (Number(versionMatch[1]) === 10 && Number(versionMatch[2]) >= 11)),
  );

  console.info(
    JSON.stringify(
      {
        host: connection.host,
        port: connection.port,
        database: connection.database,
        version: server.version,
        comment: server.comment,
        mariaDb1011Compatible: compatible,
      },
      null,
      2,
    ),
  );

  if (!compatible) {
    process.exitCode = 2;
  }
} finally {
  await prisma.$disconnect();
}
