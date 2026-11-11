import { createPrismaClient } from '../src/infrastructure/database/prisma.js';
import { ROLE_SEEDS } from './seed-data.js';

const prisma = createPrismaClient();

try {
  await prisma.$transaction(
    ROLE_SEEDS.map((role) =>
      prisma.role.upsert({
        where: { code: role.code },
        update: { label: role.label },
        create: role,
      }),
    ),
  );

  console.info('Perfis institucionais sincronizados com sucesso.');
} finally {
  await prisma.$disconnect();
}
