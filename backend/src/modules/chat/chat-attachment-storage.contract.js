import { Readable } from 'node:stream';

export const CHAT_ATTACHMENT_STORAGE_KINDS = Object.freeze({
  STAGING: 'staging',
  OBJECT: 'objects',
  QUARANTINE: 'quarantine',
});

export const CHAT_ATTACHMENT_STORAGE_ERROR_CODES = Object.freeze({
  INVALID_KEY: 'CHAT_STORAGE_INVALID_KEY',
  INVALID_STREAM: 'CHAT_STORAGE_INVALID_STREAM',
  NOT_FOUND: 'CHAT_STORAGE_NOT_FOUND',
  ALREADY_EXISTS: 'CHAT_STORAGE_ALREADY_EXISTS',
  CONTENT_MISMATCH: 'CHAT_STORAGE_CONTENT_MISMATCH',
  SIZE_LIMIT_EXCEEDED: 'CHAT_STORAGE_SIZE_LIMIT_EXCEEDED',
  TIMEOUT: 'CHAT_STORAGE_TIMEOUT',
  SYMLINK_NOT_ALLOWED: 'CHAT_STORAGE_SYMLINK_NOT_ALLOWED',
  CONCURRENCY_LIMIT: 'CHAT_STORAGE_CONCURRENCY_LIMIT',
  IO_FAILURE: 'CHAT_STORAGE_IO_FAILURE',
});

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const KEY_PATTERNS = Object.freeze({
  [CHAT_ATTACHMENT_STORAGE_KINDS.STAGING]: new RegExp(`^staging/${UUID_PATTERN}\\.upload$`, 'i'),
  [CHAT_ATTACHMENT_STORAGE_KINDS.OBJECT]: new RegExp(`^objects/[0-9a-f]{2}/${UUID_PATTERN}\\.object$`, 'i'),
  [CHAT_ATTACHMENT_STORAGE_KINDS.QUARANTINE]: new RegExp(`^quarantine/[0-9a-f]{2}/${UUID_PATTERN}\\.quarantine$`, 'i'),
});

export class ChatAttachmentStorageError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ChatAttachmentStorageError';
    this.code = code;
    this.retryable = Boolean(options.retryable);
  }
}

export function storageError(code, message, options) {
  return new ChatAttachmentStorageError(code, message, options);
}

export function validateStorageKey(key, expectedKind) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 180) {
    throw storageError(
      CHAT_ATTACHMENT_STORAGE_ERROR_CODES.INVALID_KEY,
      'A chave interna de armazenamento é inválida.',
    );
  }

  if (
    key.includes('\\')
    || key.includes('\0')
    || key.includes('..')
    || key.startsWith('/')
    || /^[a-z]:/i.test(key)
  ) {
    throw storageError(
      CHAT_ATTACHMENT_STORAGE_ERROR_CODES.INVALID_KEY,
      'A chave interna de armazenamento é inválida.',
    );
  }

  const matchedKind = Object.entries(KEY_PATTERNS)
    .find(([, pattern]) => pattern.test(key))?.[0];

  if (!matchedKind || (expectedKind && matchedKind !== expectedKind)) {
    throw storageError(
      CHAT_ATTACHMENT_STORAGE_ERROR_CODES.INVALID_KEY,
      'A chave interna de armazenamento é inválida.',
    );
  }

  return { key, kind: matchedKind };
}

export function requireReadableStream(stream) {
  if (!(stream instanceof Readable) && typeof stream?.pipe !== 'function') {
    throw storageError(
      CHAT_ATTACHMENT_STORAGE_ERROR_CODES.INVALID_STREAM,
      'O conteúdo deve ser fornecido como stream de leitura.',
    );
  }
  return stream;
}

export function requireIntegrity(integrity) {
  const sizeBytes = Number(integrity?.sizeBytes);
  const sha256 = String(integrity?.sha256 ?? '').toLowerCase();
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw storageError(
      CHAT_ATTACHMENT_STORAGE_ERROR_CODES.CONTENT_MISMATCH,
      'Os metadados de integridade do objeto são inválidos.',
    );
  }
  return { sizeBytes, sha256 };
}

/**
 * Contrato estrutural do storage privado do Chat.
 *
 * Semântica obrigatória dos adapters:
 * - createStagingKey()/createObjectKey(): retornam chaves opacas e não reservam espaço.
 * - writeStaging(stream, options): consome chunks com backpressure, mas o chamador continua
 *   responsável por encerrar/destruir o stream de origem após sucesso ou erro. Retorna somente
 *   chave, tamanho e SHA-256 interno. Nunca retorna caminho físico.
 * - head(key, options): retorna metadados físicos; NOT_FOUND para objeto ausente.
 * - exists(key): retorna false exclusivamente para ausência; erros de segurança são propagados.
 * - promote(stagingKey, objectKey, integrity): exige tamanho/hash esperados, nunca sobrescreve
 *   conteúdo divergente e é idempotente quando o destino confirmado já existe.
 * - openReadStream(objectKey): abre somente objetos definitivos; o consumidor é responsável por
 *   consumir ou destruir o stream retornado.
 * - quarantine(key, options): move staging/objeto para chave isolada e verificável; não exclui.
 * - removeTemporary(key): aceita somente staging e é idempotente. Objetos e quarentena não podem
 *   ser removidos por este contrato.
 *
 * As operações mutáveis devem respeitar o limite de concorrência do adapter. Falhas parciais
 * preservam a origem até que o destino tenha tamanho e hash confirmados. O contrato é
 * deliberadamente independente de Express, Prisma, MariaDB, RBAC e nomes originais de arquivos.
 */
export function assertChatAttachmentStorage(storage) {
  const methods = [
    'createStagingKey',
    'createObjectKey',
    'writeStaging',
    'head',
    'promote',
    'openReadStream',
    'exists',
    'quarantine',
    'removeTemporary',
  ];

  for (const method of methods) {
    if (typeof storage?.[method] !== 'function') {
      throw new TypeError(`Storage do Chat sem operação obrigatória: ${method}.`);
    }
  }

  return storage;
}
