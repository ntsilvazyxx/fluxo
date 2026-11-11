import { randomUUID } from 'node:crypto';
import { AppError } from '../../shared/errors/app-error.js';

const missing = () => new AppError(404, 'TEAM_NOT_FOUND', 'Equipe não encontrada.');
const scope = (actor) => actor.roleCode === 'MANAGER'
  ? { managers: { some: { userId: actor.userId, endedAt: null } } }
  : actor.roleCode === 'TECHNICIAN' ? { memberships: { some: { userId: actor.userId, leftAt: null } } } : {};
const view = (team) => ({ id: team.id, name: team.name, isActive: team.isActive, version: team.version, createdAt: team.createdAt, updatedAt: team.updatedAt });
const audit = (tx, req, data) => tx.auditEvent.create({ data: { id: randomUUID(), actorId: req.auth.userId, correlationId: req.correlationId, ...data } });

export const createTeamService = ({ prisma }) => ({
  async list(actor) { return (await prisma.team.findMany({ where: scope(actor), orderBy: { name: 'asc' } })).map(view); },
  async get(actor, id) {
    const team = await prisma.team.findFirst({ where: { id, ...scope(actor) }, include: { memberships: { where: { leftAt: null }, include: { user: { include: { role: true } } } }, managers: { where: { endedAt: null }, include: { user: { include: { role: true } } } } } });
    if (!team) throw missing();
    return { ...view(team), members: team.memberships.map((x) => ({ id: x.id, userId: x.userId, name: x.user.name, roleCode: x.user.role.code, joinedAt: x.joinedAt })), managers: team.managers.map((x) => ({ id: x.id, userId: x.userId, name: x.user.name, assignedAt: x.assignedAt })) };
  },
  async create(req, input) {
    return prisma.$transaction(async (tx) => { const team = await tx.team.create({ data: { id: randomUUID(), name: input.name } }); await audit(tx, req, { entityType: 'Team', entityId: team.id, action: 'TEAM_CREATED', afterJson: view(team) }); return view(team); });
  },
  async addLink(req, teamId, userId, kind) {
    return prisma.$transaction(async (tx) => {
      const [team, user] = await Promise.all([tx.team.findFirst({ where: { id: teamId, isActive: true } }), tx.user.findFirst({ where: { id: userId, isActive: true, deletedAt: null }, include: { role: true } })]);
      if (!team) throw missing();
      if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
      if (kind === 'manager' && user.role.code !== 'MANAGER') throw new AppError(400, 'INVALID_MANAGER_ROLE', 'Somente usuários Gestor podem gerir equipes.');
      const now = new Date();
      const link = kind === 'manager'
        ? await tx.teamManager.create({ data: { id: randomUUID(), teamId, userId, assignedAt: now } })
        : await tx.teamMember.create({ data: { id: randomUUID(), teamId, userId, joinedAt: now } });
      await audit(tx, req, { entityType: kind === 'manager' ? 'TeamManager' : 'TeamMember', entityId: link.id, action: kind === 'manager' ? 'TEAM_MANAGER_ASSIGNED' : 'TEAM_MEMBER_ASSIGNED', afterJson: { teamId, userId } });
      return link;
    });
  },
  async removeLink(req, teamId, userId, kind) {
    return prisma.$transaction(async (tx) => {
      const model = kind === 'manager' ? tx.teamManager : tx.teamMember;
      const endField = kind === 'manager' ? 'endedAt' : 'leftAt';
      const current = await model.findFirst({ where: { teamId, userId, [endField]: null } });
      if (!current) throw new AppError(404, 'ACTIVE_LINK_NOT_FOUND', 'Vínculo ativo não encontrado.');
      const updated = await model.update({ where: { id: current.id }, data: { [endField]: new Date() } });
      await audit(tx, req, { entityType: kind === 'manager' ? 'TeamManager' : 'TeamMember', entityId: current.id, action: kind === 'manager' ? 'TEAM_MANAGER_ENDED' : 'TEAM_MEMBER_ENDED', beforeJson: { teamId, userId }, reason: 'Vínculo encerrado por usuário autorizado.' });
      return updated;
    });
  },
});
