import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from '../../src/shared/security/password.js';
import { presentTask } from '../../src/modules/tasks/task.presenter.js';
import { requireIntegrationClient } from './context.js';
const roles = ['ADMIN_MASTER', 'SECRETARY', 'MANAGER', 'TECHNICIAN'];
export function factories(prisma) {
  requireIntegrationClient(prisma);
  const run = randomUUID();
  const prefix = (label) => `IT-${run}-${label}`;
  return {
    run,
    async profile(code) {
      if (!roles.includes(code)) throw new Error('Perfil de fixture não permitido.');
      return prisma.role.upsert({ where: { code }, update: {}, create: { id: randomUUID(), code, label: code } });
    },
    async user(roleCode, password, label = roleCode) {
      const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
      return prisma.user.create({ data: { id: randomUUID(), name: prefix(label), emailNormalized: `${randomUUID()}@integration.invalid`, passwordHash: await hashPassword(password), roleId: role.id } });
    },
    async team(label = 'Equipe') { return prisma.team.create({ data: { id: randomUUID(), name: prefix(label) } }); },
    async calendar(teamId, authorId) {
      const calendar = await prisma.workCalendar.create({ data: { id: randomUUID(), teamId, timezone: 'America/Cuiaba' } });
      const version = await prisma.calendarVersion.create({ data: { id: randomUUID(), calendarId: calendar.id, versionNumber: 1, effectiveFrom: new Date('2026-01-01T00:00:00Z'), createdById: authorId } });
      await prisma.workSchedule.createMany({ data: [1, 2, 3, 4, 5].map((weekday) => ({ id: randomUUID(), calendarVersionId: version.id, weekday, startMinute: 480, endMinute: 1080 })) });
      await prisma.calendarVersion.update({ where: { id: version.id }, data: { publishedAt: new Date() } });
      await prisma.workCalendar.update({ where: { id: calendar.id }, data: { activeVersionId: version.id } });
      await prisma.team.update({ where: { id: teamId }, data: { calendarId: calendar.id } });
      return { calendar, version };
    },
    // Historical scenarios deliberately bypass the NEW-task API: they represent
    // already persisted legacy records, without weakening the production contract.
    async legacyTask({ teamId, authorId, title = prefix('Legado'), priority = 'NORMAL', deadlineAt = null, parentCycleId = null }) {
      return prisma.$transaction(async (tx) => {
        const task = await tx.task.create({ data: { id: randomUUID(), teamId, createdById: authorId, parentCycleId } });
        const cycle = await tx.taskCycle.create({ data: { id: randomUUID(), taskId: task.id, cycleNumber: 1, title, description: 'Fixture histórica sintética LEGACY_CALENDAR', priority, deadlinePolicy: 'LEGACY_CALENDAR', deadlineAt } });
        await tx.task.update({ where: { id: task.id }, data: { currentCycleId: cycle.id } });
        return presentTask(await tx.task.findUnique({ where: { id: task.id }, include: { team: true, currentCycle: { include: { assignments: { include: { user: true } } } } } }));
      });
    },
    async cycle(taskId, overrides = {}) { return prisma.taskCycle.create({ data: { id: randomUUID(), taskId, cycleNumber: 1, title: prefix('Ciclo'), description: 'Ciclo sintético', ...overrides } }); },
    async assignment(cycleId, userId, assignedById, overrides = {}) { return prisma.taskAssignment.create({ data: { id: randomUUID(), cycleId, userId, assignedById, ...overrides } }); },
    async request(cycleId, assignmentId, overrides = {}) { return prisma.taskRequest.create({ data: { id: randomUUID(), cycleId, assignmentId, type: 'RETURN', reason: prefix('Solicitação'), ...overrides } }); },
    async history(actorId, entityId, overrides = {}) { return prisma.auditEvent.create({ data: { id: randomUUID(), actorId, entityType: 'TaskCycle', entityId, action: 'SYNTHETIC_HISTORY', correlationId: randomUUID(), ...overrides } }); },
    async staged(uploadedById, overrides = {}) { return prisma.stagedUpload.create({ data: { id: randomUUID(), uploadedById, originalName: 'fixture.pdf', stagingKey: `staging/${randomUUID()}.upload`, mimeType: 'application/pdf', sizeBytes: 32, checksum: 'a'.repeat(64), expiresAt: new Date(Date.now() + 60000), ...overrides } }); },
    async attachment(cycleId, uploadedById, overrides = {}) { return prisma.taskAttachment.create({ data: { id: randomUUID(), cycleId, uploadedById, origin: 'INITIAL', originalName: 'fixture.pdf', storageKey: `objects/${randomUUID()}.pdf`, mimeType: 'application/pdf', sizeBytes: 32, checksum: 'a'.repeat(64), ...overrides } }); },
  };
}
export async function fixtures(prisma) {
  const f = factories(prisma);
  const password = `It-${randomBytes(18).toString('hex')}A`;
  const users = {};
  for (const [name, code] of Object.entries({ admin: 'ADMIN_MASTER', secretary: 'SECRETARY', manager: 'MANAGER', technician: 'TECHNICIAN', outsider: 'MANAGER' })) users[name] = await f.user(code, password, name);
  const team = await f.team();
  await prisma.teamManager.create({ data: { id: randomUUID(), teamId: team.id, userId: users.manager.id, assignedAt: new Date() } });
  for (const user of [users.manager, users.secretary, users.technician]) await prisma.teamMember.create({ data: { id: randomUUID(), teamId: team.id, userId: user.id, joinedAt: new Date() } });
  const calendar = await f.calendar(team.id, users.secretary.id);
  return { run: f.run, users, team, password, ...calendar };
}
export const runningTaskInput = (teamId, userId, overrides = {}) => ({ teamId, userId, title: `RUNNING_CLOCK ${randomUUID()}`, description: 'Fixture via API real com atribuição atômica', acceptanceDurationMinutes: 60, executionDurationMinutes: 1440, ...overrides });
