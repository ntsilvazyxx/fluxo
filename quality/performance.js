import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { testDatabase, checkDatabase } from './test-database.js';
import { parseDatabaseUrl } from '../backend/src/infrastructure/database/prisma.js';
import { fixtures } from './fixtures.js';

const { url, prisma: initial } = testDatabase(); await initial.$disconnect();
process.env.DATABASE_URL = url; process.env.MAIL_ENABLED = '0'; process.env.NODE_ENV = 'test';
process.env.AUTH_DATA_ENCRYPTION_KEY = randomBytes(32).toString('hex');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb({ ...parseDatabaseUrl(url), connectionLimit: 10 }), log: [{ emit: 'event', level: 'query' }] });
let queries = 0; prisma.$on('query', () => { queries++; });
const { createApp } = await import('../backend/src/app.js');
const { env } = await import('../backend/src/config/env.js');
const { createOutboxService } = await import('../backend/src/modules/outbox/outbox.service.js');
let server;
try {
  const db = await checkDatabase(prisma);
  const migrations = await prisma.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
  for (const row of migrations) {
    if (!row.finished_at || row.rolled_back_at || row.checksum !== createHash('sha256').update(readFileSync(`backend/prisma/migrations/${row.migration_name}/migration.sql`)).digest('hex')) throw Error('Migração incompatível');
  }
  const f = await fixtures(prisma);
  const count = 300; const now = new Date();
  const tasks = Array.from({ length: count }, () => ({ id: randomUUID(), teamId: f.team.id, createdById: f.users.secretary.id }));
  const cycles = tasks.map((task, i) => ({ id: randomUUID(), taskId: task.id, cycleNumber: 1, title: `Volume QA9 ${i}`, description: 'Dados exclusivos da carga local', openedAt: now,
    status: i % 3 === 0 ? 'PENDING' : i % 3 === 1 ? 'IN_PROGRESS' : 'COMPLETED',
    closedAt: i % 3 === 2 ? now : null, completionText: i % 3 === 2 ? 'Entrega de carga controlada' : null,
    deadlineAt: i % 3 ? new Date(now.getTime() + 86400000) : null }));
  await prisma.task.createMany({ data: tasks }); await prisma.taskCycle.createMany({ data: cycles });
  for (const cycle of cycles) await prisma.task.update({ where: { id: cycle.taskId }, data: { currentCycleId: cycle.id } });
  const calendar = await prisma.workCalendar.findUniqueOrThrow({ where: { teamId: f.team.id } });
  await prisma.taskAssignment.createMany({ data: cycles.filter((c) => c.status === 'IN_PROGRESS').map((c) => ({ id: randomUUID(), cycleId: c.id, userId: f.users.technician.id, assignedById: f.users.manager.id, calendarVersionId: calendar.activeVersionId, assignedAt: now, acceptedAt: now })) });
  const app = createApp({ prisma, config: { ...env, accessTokenTtlSeconds: 900, loginMaxAttempts: 20 }, startOutboxWorker: false });
  server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const api = `http://127.0.0.1:${server.address().port}/api/v1`;
  const auth = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: f.users.manager.emailNormalized, password: f.password }) });
  if (!auth.ok) throw Error('Login da carga falhou');
  const token = (await auth.json()).data.accessToken;
  const memoryBefore = process.memoryUsage(); let peakRss = memoryBefore.rss;
  const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 20);
  const results = [];
  try {
    for (const route of [`/tasks?teamId=${f.team.id}&pageSize=20`, `/reports?teamId=${f.team.id}&pageSize=20`, `/dashboard?teamId=${f.team.id}`, '/notifications?pageSize=20']) {
      for (let i = 0; i < 3; i++) { const r = await fetch(`${api}${route}`, { headers: { authorization: `Bearer ${token}` } }); if (!r.ok) throw Error(`Warmup ${r.status}`); await r.arrayBuffer(); }
      queries = 0; const times = []; const failures = []; const started = performance.now(); let next = 0;
      await Promise.all(Array.from({ length: 5 }, async () => {
        while (next++ < 50) {
          const begin = performance.now();
          const r = await fetch(`${api}${route}`, { headers: { authorization: `Bearer ${token}` } });
          await r.arrayBuffer(); if (!r.ok) failures.push(r.status); times.push(performance.now() - begin);
        }
      }));
      times.sort((a, b) => a - b);
      results.push({ route: route.split('?')[0], requests: times.length, concurrency: 5, failures, p50Ms: +times[Math.floor(times.length * .5)].toFixed(2), p95Ms: +times[Math.floor(times.length * .95)].toFixed(2), maxMs: +times.at(-1).toFixed(2), requestsPerSecond: +(times.length / ((performance.now() - started) / 1000)).toFixed(2), sqlStatements: queries, sqlPerRequest: queries / times.length });
    }
  } finally { clearInterval(sampler); }
  const outbox = createOutboxService({ emailSender: { send: async () => { throw Error('SMTP proibido na carga'); } } });
  const paginationProbe = [];
  for (const size of [20, 100]) {
    queries = 0;
    const response = await fetch(`${api}/reports?teamId=${f.team.id}&pageSize=${size}`, { headers: { authorization: `Bearer ${token}` } });
    const body = await response.json();
    if (!response.ok || body.data.rows.length !== size) throw Error('Falha na paginação real');
    paginationProbe.push({ pageSize: size, returned: body.data.rows.length, sqlStatements: queries });
  }
  const queryPlan = await prisma.$queryRaw`EXPLAIN SELECT id FROM tasks WHERE teamId = ${f.team.id} AND deletedAt IS NULL`;
  const prefix = `qa9-load:${f.run}:`;
  const assignedCycle = cycles.find((c) => c.status === 'IN_PROGRESS');
  const assignment = await prisma.taskAssignment.findFirstOrThrow({ where: { cycleId: assignedCycle.id } });
  await prisma.outboxEvent.createMany({ data: Array.from({ length: 100 }, (_, i) => ({ id: randomUUID(), eventType: 'TASK_ASSIGNED', dedupeKey: `${prefix}${i}`, payloadJson: { taskId: assignedCycle.taskId, assignmentId: assignment.id, userId: f.users.technician.id } })) });
  await prisma.notificationPreference.create({ data: { id: randomUUID(), userId: f.users.technician.id, notificationType: 'TASK_ASSIGNED', internalEnabled: true, emailEnabled: false } });
  const outboxStart = performance.now(); let processed = 0;
  // Claim only this run's events; a CAS contention loss is retried on the next pass.
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (true) {
      const event = await outbox.claimEvent(prisma, { dedupeKey: { startsWith: prefix } });
      if (!event) {
        if (await prisma.outboxEvent.count({ where: { dedupeKey: { startsWith: prefix }, status: 'PENDING' } })) continue;
        break;
      }
      await outbox.processEvent(prisma, event); await outbox.completeEvent(prisma, event.id, true); processed++;
    }
  }));
  const notifications = await prisma.notification.count({ where: { userId: f.users.technician.id, type: 'TASK_ASSIGNED' } });
  const indexes = await prisma.$queryRaw`SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName, COLUMN_NAME AS columnName FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`;
  const triggers = await prisma.$queryRaw`SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() ORDER BY TRIGGER_NAME`;
  const referential = await prisma.$queryRaw`SELECT COUNT(*) AS invalidPointers FROM tasks t JOIN task_cycles c ON c.id=t.currentCycleId WHERE c.taskId <> t.id`;
  const output = { generatedAt: new Date(), db, dataset: { tasks: count, cycles: count, currentAssignments: 100, outboxEvents: 100 }, results, paginationProbe, queryPlan, memory: { rssBeforeMiB: memoryBefore.rss / 1048576, peakRssMiB: peakRss / 1048576, heapAfterMiB: process.memoryUsage().heapUsed / 1048576 }, outbox: { processed, notifications, durationMs: +(performance.now() - outboxStart).toFixed(2) }, migrations: migrations.map((r) => r.migration_name), indexes, indexCount: new Set(indexes.map((i) => `${i.tableName}/${i.indexName}`)).size, triggers, invalidPointers: Number(referential[0].invalidPointers) };
  mkdirSync('.artifacts', { recursive: true }); const serialize = (_key, value) => typeof value === 'bigint' ? String(value) : value;
  writeFileSync('.artifacts/performance.json', JSON.stringify(output, serialize, 2));
  console.info(JSON.stringify({ ...output, indexes: indexes.length, triggers: triggers.length }, serialize, 2));
  if (results.some((r) => r.failures.length) || processed !== 100 || notifications !== 100 || output.invalidPointers) process.exitCode = 1;
} finally { if (server) await new Promise((resolve) => server.close(resolve)); await prisma.$disconnect(); }
