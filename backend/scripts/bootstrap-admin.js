import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '../src/infrastructure/database/prisma.js';
import { hashPassword } from '../src/shared/security/password.js';
import { userPasswordSchema } from '../src/modules/auth/auth.schemas.js';

const email = process.env.SEAF_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.SEAF_BOOTSTRAP_ADMIN_NAME?.trim();
const password = process.env.SEAF_BOOTSTRAP_ADMIN_PASSWORD;
if (!email || !name || !userPasswordSchema.safeParse(password).success) throw new Error('Defina SEAF_BOOTSTRAP_ADMIN_NAME, SEAF_BOOTSTRAP_ADMIN_EMAIL e uma senha forte em SEAF_BOOTSTRAP_ADMIN_PASSWORD.');

const prisma = createPrismaClient();
try {
  const role = await prisma.role.findUnique({ where: { code: 'ADMIN_MASTER' } });
  if (!role) throw new Error('Execute o seed dos perfis antes do bootstrap.');
  if (await prisma.user.findFirst({ where: { roleId: role.id, deletedAt: null } })) throw new Error('Já existe ADMIN MASTER; bootstrap recusado.');
  await prisma.user.create({ data: { id: randomUUID(), name, emailNormalized: email, passwordHash: await hashPassword(password), roleId: role.id } });
  console.info('ADMIN MASTER inicial criado com sucesso.');
} finally { await prisma.$disconnect(); }
