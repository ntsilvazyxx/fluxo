import { defineConfig, env } from 'prisma/config';

// Configuração isolada para migração de integração:
// NUNCA carrega ../.env ou arquivos de ambiente da aplicação.
// Exige explicitamente DATABASE_URL fornecida na sessão do terminal.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
