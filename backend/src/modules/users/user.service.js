import { randomUUID } from 'node:crypto';
import { AppError } from '../../shared/errors/app-error.js';
import { hashPassword } from '../../shared/security/password.js';
import { presentUser } from './user.presenter.js';

const notFound = () => new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
const visibleWhere = (actor) => actor.roleCode === 'MANAGER'
  ? { memberships: { some: { leftAt: null, team: { managers: { some: { userId: actor.userId, endedAt: null } } } } } }
  : actor.roleCode === 'TECHNICIAN' ? { id: actor.userId } : {};
const audit = (tx, request, data) => tx.auditEvent.create({ data: { id: randomUUID(), actorId: request.auth.userId, correlationId: request.correlationId, ...data } });

export const createUserService = ({ prisma }) => ({
  async list(actor, q) {
    const users = await prisma.user.findMany({ where: { deletedAt: null, ...visibleWhere(actor), ...(q ? { OR: [{ name: { contains: q } }, { emailNormalized: { contains: q.toLowerCase() } }] } : {}) }, include: { role: true }, orderBy: { name: 'asc' } });
    return users.map(presentUser);
  },
  async get(actor, id) {
    const user = await prisma.user.findFirst({ where: { id, deletedAt: null, ...visibleWhere(actor) }, include: { role: true } });
    if (!user) throw notFound();
    return presentUser(user);
  },
  async create(request, input) {
    if (request.auth.roleCode === 'SECRETARY' && !['MANAGER', 'TECHNICIAN'].includes(input.roleCode)) throw new AppError(403, 'FORBIDDEN_ROLE', 'O perfil informado não pode ser criado pelo Secretário.');
    const role = await prisma.role.findUnique({ where: { code: input.roleCode } });
    if (!role) throw new AppError(400, 'INVALID_ROLE', 'Perfil inválido.');
    const passwordHash = await hashPassword(input.password);
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { id: randomUUID(), name: input.name, emailNormalized: input.email.trim().toLowerCase(), passwordHash, roleId: role.id }, include: { role: true } });
      await audit(tx, request, { entityType: 'User', entityId: user.id, action: 'USER_CREATED', afterJson: presentUser(user) });
      return presentUser(user);
    });
  },
  async update(request, id, input) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.user.findFirst({ where: { id, deletedAt: null }, include: { role: true } });
      if (!current) throw notFound();
      const role = input.roleCode ? await tx.role.findUnique({ where: { code: input.roleCode } }) : null;
      const updated = await tx.user.update({ where: { id }, data: { ...(input.name ? { name: input.name } : {}), ...(role ? { roleId: role.id } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}), version: { increment: 1 } }, include: { role: true } });
      if (input.isActive === false) await tx.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(tx, request, { entityType: 'User', entityId: id, action: 'USER_UPDATED', beforeJson: presentUser(current), afterJson: presentUser(updated), reason: input.reason });
      return presentUser(updated);
    });
  },
});
