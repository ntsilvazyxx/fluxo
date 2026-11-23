import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProductionConfig } from './production-policy.js';

dotenv.config({ path: new URL('../../../.env', import.meta.url), quiet: true });

const parsePort = (value) => {
  const port = Number(value ?? 3001);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('PORT deve ser um número inteiro entre 1 e 65535.');
  }

  return port;
};

const parseOrigins = (value) =>
  (value ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const parsePositiveInteger = (name, value, fallback) => {
  const parsed = Number(value ?? fallback);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} deve ser um número inteiro positivo.`);
  }

  return parsed;
};

const required = (name) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} deve ser definida no ambiente.`);
  }

  return value;
};

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const resolveRepositoryPath = (value) => path.resolve(repositoryRoot, value);

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parsePort(process.env.PORT),
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  authDataEncryptionKey: process.env.AUTH_DATA_ENCRYPTION_KEY ?? '',
  accessTokenTtlSeconds: parsePositiveInteger(
    'ACCESS_TOKEN_TTL_SECONDS',
    process.env.ACCESS_TOKEN_TTL_SECONDS,
    900,
  ),
  refreshTokenTtlDays: parsePositiveInteger(
    'REFRESH_TOKEN_TTL_DAYS',
    process.env.REFRESH_TOKEN_TTL_DAYS,
    30,
  ),
  passwordResetTtlMinutes: parsePositiveInteger(
    'PASSWORD_RESET_TTL_MINUTES',
    process.env.PASSWORD_RESET_TTL_MINUTES,
    30,
  ),
  loginWindowMinutes: parsePositiveInteger(
    'LOGIN_RATE_WINDOW_MINUTES',
    process.env.LOGIN_RATE_WINDOW_MINUTES,
    15,
  ),
  loginMaxAttempts: parsePositiveInteger(
    'LOGIN_RATE_MAX_ATTEMPTS',
    process.env.LOGIN_RATE_MAX_ATTEMPTS,
    10,
  ),
  cookieSecure: process.env.COOKIE_SECURE === '1',
  adminTaskCreationEnabled: process.env.ADMIN_TASK_CREATION_ENABLED === '1',
  imageStoragePath:
    process.env.IMAGE_STORAGE_PATH ??
    fileURLToPath(new URL('../../storage/images', import.meta.url)),
  attachmentStoragePath: process.env.ATTACHMENT_STORAGE_PATH ?? fileURLToPath(new URL('../../storage/attachments', import.meta.url)),
  attachmentUploadTimeoutMs: parsePositiveInteger('ATTACHMENT_UPLOAD_TIMEOUT_MS', process.env.ATTACHMENT_UPLOAD_TIMEOUT_MS, 300000),
  attachmentTechnicalMaxBytes: parsePositiveInteger('ATTACHMENT_TECHNICAL_MAX_BYTES', process.env.ATTACHMENT_TECHNICAL_MAX_BYTES, 1073741824),
  attachmentStagingTtlMinutes: parsePositiveInteger('ATTACHMENT_STAGING_TTL_MINUTES', process.env.ATTACHMENT_STAGING_TTL_MINUTES, 60),
  // Fase 5.1.1: contrato de storage privado do Chat. O recurso HTTP permanece desabilitado.
  chatAttachmentStorageEnabled: process.env.CHAT_ATTACHMENT_STORAGE_ENABLED === '1',
  chatAttachmentStorageDriver: process.env.CHAT_ATTACHMENT_STORAGE_DRIVER ?? 'local',
  chatAttachmentStoragePath:
    (process.env.CHAT_ATTACHMENT_STORAGE_PATH
      ? resolveRepositoryPath(process.env.CHAT_ATTACHMENT_STORAGE_PATH)
      : fileURLToPath(new URL('../../storage/chat-attachments', import.meta.url))),
  chatAttachmentStorageMaxBytes: parsePositiveInteger(
    'CHAT_ATTACHMENT_STORAGE_MAX_BYTES',
    process.env.CHAT_ATTACHMENT_STORAGE_MAX_BYTES,
    20 * 1024 * 1024,
  ),
  chatAttachmentStorageTimeoutMs: parsePositiveInteger(
    'CHAT_ATTACHMENT_STORAGE_TIMEOUT_MS',
    process.env.CHAT_ATTACHMENT_STORAGE_TIMEOUT_MS,
    300000,
  ),
  chatAttachmentStorageMaxConcurrentWrites: parsePositiveInteger(
    'CHAT_ATTACHMENT_STORAGE_MAX_CONCURRENT_WRITES',
    process.env.CHAT_ATTACHMENT_STORAGE_MAX_CONCURRENT_WRITES,
    4,
  ),
  chatAttachmentStagingTtlMinutes: parsePositiveInteger(
    'CHAT_ATTACHMENT_STAGING_TTL_MINUTES',
    process.env.CHAT_ATTACHMENT_STAGING_TTL_MINUTES,
    1440,
  ),
  chatAttachmentQuarantineDays: parsePositiveInteger(
    'CHAT_ATTACHMENT_QUARANTINE_DAYS',
    process.env.CHAT_ATTACHMENT_QUARANTINE_DAYS,
    30,
  ),
  // Reservadas: não ativam scanner ou quotas nesta subfase.
  chatAttachmentScannerEnabled: process.env.CHAT_ATTACHMENT_SCANNER_ENABLED === '1',
  chatAttachmentUserQuotaBytes: process.env.CHAT_ATTACHMENT_USER_QUOTA_BYTES ?? '',
  chatAttachmentConversationQuotaBytes: process.env.CHAT_ATTACHMENT_CONVERSATION_QUOTA_BYTES ?? '',
  mailEnabled: process.env.MAIL_ENABLED === '1',
  mailHost: process.env.MAIL_HOST ?? 'localhost',
  mailPort: parsePositiveInteger('MAIL_PORT', process.env.MAIL_PORT, 25),
  mailConnectionTimeout: parsePositiveInteger('MAIL_CONNECTION_TIMEOUT_MS', process.env.MAIL_CONNECTION_TIMEOUT_MS, 10000),
  mailGreetingTimeout: parsePositiveInteger('MAIL_GREETING_TIMEOUT_MS', process.env.MAIL_GREETING_TIMEOUT_MS, 10000),
  mailSocketTimeout: parsePositiveInteger('MAIL_SOCKET_TIMEOUT_MS', process.env.MAIL_SOCKET_TIMEOUT_MS, 30000),
  mailUser: process.env.MAIL_USER ?? '',
  mailPass: process.env.MAIL_PASS ?? '',
  mailFrom: process.env.MAIL_FROM ?? 'seaf@instituto.local',
  mailFromName: process.env.MAIL_FROM_NAME ?? 'SEAF Gestão de Tarefas',
  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:5173',
});

validateProductionConfig(env);
