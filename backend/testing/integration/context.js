import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openGuardedIntegration, validateIntegrationEnvironment, writableIntegrationDatabase } from '../../scripts/integration-guard.js';
import { createApp } from '../../src/app.js';
const validated = new WeakMap();
let runtime;
export function requireIntegrationClient(client) {
  if (!validated.has(client)) throw new Error('Fixture/API exige conexão de integração validada.');
  if (validated.get(client) !== integrationDatabaseName()) throw new Error('Destino da conexão diverge da campanha selecionada.');
}
function isolatedRuntime() {
  if (!runtime) {
    const root = mkdtempSync(path.join(os.tmpdir(), 'seaf-integration-'));
    runtime = { root, runId: randomUUID(), jwtAccessSecret: randomBytes(48).toString('hex'), authDataEncryptionKey: randomBytes(32).toString('hex'), imageStoragePath: path.join(root, 'images'), attachmentStoragePath: path.join(root, 'attachments') };
    process.once('exit', () => {
      if (path.dirname(root) === path.resolve(os.tmpdir()) && /^seaf-integration-/.test(path.basename(root))) rmSync(root, { recursive: true, force: true });
    });
  }
  return runtime;
}
export async function createIntegrationPrisma(_url, options = {}) {
  const databaseName = integrationDatabaseName();
  const expected = validateIntegrationEnvironment(process.env);
  if (_url && validateIntegrationEnvironment({ ...process.env, DATABASE_URL: _url, TEST_DATABASE_URL: _url }) !== expected) throw new Error('URL adicional diverge do ambiente de integração.');
  const client = await openGuardedIntegration({ connect: async (url) => {
    const { createPrismaClient } = await import('../../src/infrastructure/database/prisma.js');
    return createPrismaClient(url, options);
  } });
  // A supplied URL may not silently override the validated environment.
  try {
    for (const code of ['ADMIN_MASTER', 'SECRETARY', 'MANAGER', 'TECHNICIAN']) {
      await client.role.upsert({ where: { code }, update: {}, create: { id: randomUUID(), code, label: code } });
    }
    validated.set(client, databaseName); return client;
  } catch (error) { await client.$disconnect(); throw error; }
}
export async function testDatabase() { const prisma = await createIntegrationPrisma(); return { url: process.env.TEST_DATABASE_URL, prisma }; }
export function parseIntegrationTarget(value) {
  const url = validateIntegrationEnvironment({ ...process.env, DATABASE_URL: value, TEST_DATABASE_URL: value });
  return { database: new URL(url).pathname.slice(1) };
}
export function integrationDatabaseName() { return writableIntegrationDatabase(process.env); }
export async function checkDatabase(prisma) { requireIntegrationClient(prisma); return { db: validated.get(prisma) }; }
export function integrationConfig(overrides = {}) {
  integrationDatabaseName();
  const isolated = isolatedRuntime();
  return { nodeEnv: 'test', corsOrigins: ['http://localhost:5173'], accessTokenTtlSeconds: 900,
    refreshTokenTtlDays: 1, passwordResetTtlMinutes: 30, cookieSecure: false,
    loginWindowMinutes: 15, loginMaxAttempts: 1000,
    mailFrom: 'seaf@integration.invalid', mailFromName: 'SEAF integração', appBaseUrl: 'http://localhost:5173',
    jwtAccessSecret: isolated.jwtAccessSecret, authDataEncryptionKey: isolated.authDataEncryptionKey,
    attachmentStagingTtlMinutes: 60, attachmentTechnicalMaxBytes: 1048576, attachmentUploadTimeoutMs: 300000,
    ...overrides, mailEnabled: false, imageStoragePath: isolated.imageStoragePath, attachmentStoragePath: isolated.attachmentStoragePath };
}
export function createIntegrationApp({ prisma, config = {}, ...options }) {
  requireIntegrationClient(prisma);
  if (options.startOutboxWorker) throw new Error('Worker automático proibido na integração.');
  return createApp({ ...options, prisma, startOutboxWorker: false, config: integrationConfig(config) });
}
