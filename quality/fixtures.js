import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from '../backend/src/shared/security/password.js';
import { checkDatabase } from './test-database.js';

// Unique data per run. Historical records are retained; no global cleanup/reset.
export async function fixtures(prisma) {
  await checkDatabase(prisma);
  const run = randomUUID();
  const password = `Qa9-${randomBytes(18).toString('hex')}A`;
  const passwordHash = await hashPassword(password);
  const users = {};
  for (const [key, roleCode] of Object.entries({ admin: 'ADMIN_MASTER', secretary: 'SECRETARY', manager: 'MANAGER', technician: 'TECHNICIAN', outsider: 'MANAGER' })) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    users[key] = await prisma.user.create({ data: { id: randomUUID(), name: `QA9 ${key} ${run.slice(0, 8)}`, emailNormalized: `${key}.${run}@qa9.test`, passwordHash, roleId: role.id } });
  }
  const team = await prisma.team.create({ data: { id: randomUUID(), name: `QA9 ${run}` } });
  await prisma.teamManager.create({ data: { id: randomUUID(), teamId: team.id, userId: users.manager.id, assignedAt: new Date() } });
  for (const user of [users.technician, users.manager, users.secretary]) await prisma.teamMember.create({ data: { id: randomUUID(), teamId: team.id, userId: user.id, joinedAt: new Date() } });
  const calendar = await prisma.workCalendar.create({ data: { id: randomUUID(), teamId: team.id, timezone: 'America/Cuiaba' } });
  const version = await prisma.calendarVersion.create({ data: { id: randomUUID(), calendarId: calendar.id, versionNumber: 1, effectiveFrom: new Date('2026-01-01T00:00:00Z'), createdById: users.secretary.id } });
  await prisma.workSchedule.createMany({ data: [1, 2, 3, 4, 5].map((weekday) => ({ id: randomUUID(), calendarVersionId: version.id, weekday, startMinute: 480, endMinute: 1080 })) });
  await prisma.calendarVersion.update({ where: { id: version.id }, data: { publishedAt: new Date() } });
  await prisma.workCalendar.update({ where: { id: calendar.id }, data: { activeVersionId: version.id } });
  await prisma.team.update({ where: { id: team.id }, data: { calendarId: calendar.id } });
  return { run, users, team, password };
}
