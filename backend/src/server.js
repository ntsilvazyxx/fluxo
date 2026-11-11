import { createApp } from './app.js';
import { env } from './config/env.js';
import { createPrismaClient } from './infrastructure/database/prisma.js';

const prisma = createPrismaClient();
const app = createApp({ prisma });

const server = app.listen(env.port, () => {
  console.info(`SEAF API disponível em http://localhost:${env.port}/api/v1`);
});

const shutdown = (signal) => {
  console.info(`${signal} recebido. Encerrando a API...`);
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
