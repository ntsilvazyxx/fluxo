import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import {
  copyFile,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  CHAT_ATTACHMENT_STORAGE_ERROR_CODES as CODES,
  CHAT_ATTACHMENT_STORAGE_KINDS as KINDS,
  assertChatAttachmentStorage,
  requireIntegrity,
  requireReadableStream,
  storageError,
  validateStorageKey,
} from './chat-attachment-storage.contract.js';

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_CONCURRENT_WRITES = 4;
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;

const comparablePath = (value) => (process.platform === 'win32' ? value.toLowerCase() : value);
const isInside = (root, candidate) => comparablePath(candidate).startsWith(`${comparablePath(root)}${path.sep}`);
const isMissing = (error) => error?.code === 'ENOENT';

const mapIoError = (error, message = 'Falha no armazenamento privado do Chat.') => {
  if (error?.name === 'ChatAttachmentStorageError') return error;
  if (error?.name === 'AbortError') {
    return storageError(CODES.TIMEOUT, 'A operação de armazenamento foi interrompida.', {
      cause: error,
      retryable: true,
    });
  }
  return storageError(CODES.IO_FAILURE, message, { cause: error, retryable: true });
};

const createSemaphore = (limit) => {
  let active = 0;
  const waiting = [];

  const release = () => {
    const next = waiting.shift();
    if (next) {
      next();
      return;
    }
    active -= 1;
  };

  return async (operation) => {
    await new Promise((resolve) => {
      if (active < limit) {
        active += 1;
        resolve();
        return;
      }
      waiting.push(resolve);
    });
    try {
      return await operation();
    } finally {
      release();
    }
  };
};

export function createLocalChatAttachmentStorage({
  rootPath,
  maxBytes = DEFAULT_MAX_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxConcurrentWrites = DEFAULT_MAX_CONCURRENT_WRITES,
  randomId = randomUUID,
  operations = {},
} = {}) {
  if (!rootPath) throw new TypeError('rootPath é obrigatório para o storage privado do Chat.');
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new TypeError('maxBytes deve ser inteiro positivo.');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs deve ser inteiro positivo.');
  if (!Number.isSafeInteger(maxConcurrentWrites) || maxConcurrentWrites <= 0) {
    throw new TypeError('maxConcurrentWrites deve ser inteiro positivo.');
  }

  const fs = {
    copyFile,
    link,
    lstat,
    mkdir,
    open,
    readdir,
    realpath,
    rm,
    ...operations,
  };
  const root = path.resolve(rootPath);
  const withWriteSlot = createSemaphore(maxConcurrentWrites);
  let initialization;
  let canonicalRoot;

  const assertConfiguredRootHasNoLinks = async () => {
    const parsed = path.parse(root);
    let current = parsed.root;
    for (const part of root.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      try {
        const info = await fs.lstat(current);
        if (info.isSymbolicLink()) {
          throw storageError(CODES.SYMLINK_NOT_ALLOWED, 'O diretório-base do storage não pode atravessar links simbólicos.');
        }
      } catch (error) {
        if (isMissing(error)) return;
        throw error;
      }
    }
  };

  const assertPathComponentsAreNotLinks = async (candidate) => {
    const relative = path.relative(root, candidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw storageError(CODES.INVALID_KEY, 'A chave interna de armazenamento é inválida.');
    }

    let current = root;
    const parts = relative ? relative.split(path.sep).filter(Boolean) : [];
    for (const part of parts.slice(0, -1)) {
      current = path.join(current, part);
      try {
        const info = await fs.lstat(current);
        if (info.isSymbolicLink()) {
          throw storageError(CODES.SYMLINK_NOT_ALLOWED, 'Links simbólicos não são permitidos no storage privado.');
        }
      } catch (error) {
        if (isMissing(error)) return;
        throw error;
      }
    }

    const parent = path.dirname(candidate);
    const resolvedParent = await fs.realpath(parent);
    if (comparablePath(resolvedParent) !== comparablePath(canonicalRoot) && !isInside(canonicalRoot, resolvedParent)) {
      throw storageError(CODES.SYMLINK_NOT_ALLOWED, 'Links simbólicos não são permitidos no storage privado.');
    }
  };

  const ensureLayout = async () => {
    if (!initialization) {
      initialization = (async () => {
        await assertConfiguredRootHasNoLinks();
        await fs.mkdir(root, { recursive: true, mode: 0o700 });
        const rootInfo = await fs.lstat(root);
        if (rootInfo.isSymbolicLink()) {
          throw storageError(CODES.SYMLINK_NOT_ALLOWED, 'O diretório-base do storage não pode ser um link simbólico.');
        }
        canonicalRoot = await fs.realpath(root);
        for (const directory of ['staging', 'objects', 'quarantine']) {
          const target = path.join(root, directory);
          await fs.mkdir(target, { recursive: true, mode: 0o700 });
          const info = await fs.lstat(target);
          if (info.isSymbolicLink()) {
            throw storageError(CODES.SYMLINK_NOT_ALLOWED, 'Links simbólicos não são permitidos no storage privado.');
          }
        }
      })().catch((error) => {
        initialization = undefined;
        throw mapIoError(error);
      });
    }
    await initialization;
  };

  const resolveKey = async (key, expectedKind, { createParent = false } = {}) => {
    validateStorageKey(key, expectedKind);
    await ensureLayout();
    const candidate = path.resolve(root, ...key.split('/'));
    if (!isInside(root, candidate)) {
      throw storageError(CODES.INVALID_KEY, 'A chave interna de armazenamento é inválida.');
    }
    if (createParent) await fs.mkdir(path.dirname(candidate), { recursive: true, mode: 0o700 });
    await assertPathComponentsAreNotLinks(candidate);
    try {
      const info = await fs.lstat(candidate);
      if (info.isSymbolicLink()) {
        throw storageError(CODES.SYMLINK_NOT_ALLOWED, 'Links simbólicos não são permitidos no storage privado.');
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    return candidate;
  };

  const hashFile = async (filePath) => {
    const hash = createHash('sha256');
    let sizeBytes = 0;
    const input = createReadStream(filePath, { flags: constants.O_RDONLY | NO_FOLLOW });
    for await (const chunk of input) {
      sizeBytes += chunk.length;
      hash.update(chunk);
    }
    return { sizeBytes, sha256: hash.digest('hex') };
  };

  const inspectPath = async (filePath, key, { includeSha256 = false } = {}) => {
    let info;
    try {
      info = await fs.lstat(filePath);
    } catch (error) {
      if (isMissing(error)) throw storageError(CODES.NOT_FOUND, 'Objeto de armazenamento não encontrado.');
      throw error;
    }
    if (info.isSymbolicLink()) {
      throw storageError(CODES.SYMLINK_NOT_ALLOWED, 'Links simbólicos não são permitidos no storage privado.');
    }
    if (!info.isFile()) throw storageError(CODES.NOT_FOUND, 'Objeto de armazenamento não encontrado.');
    const result = {
      key,
      sizeBytes: Number(info.size),
      modifiedAt: info.mtime,
    };
    if (includeSha256) result.sha256 = (await hashFile(filePath)).sha256;
    return result;
  };

  const assertContent = async (filePath, expected) => {
    let actual;
    try {
      actual = await hashFile(filePath);
    } catch (error) {
      if (isMissing(error)) throw storageError(CODES.NOT_FOUND, 'Objeto de armazenamento não encontrado.');
      throw error;
    }
    if (actual.sizeBytes !== expected.sizeBytes || actual.sha256 !== expected.sha256) {
      throw storageError(CODES.CONTENT_MISMATCH, 'O conteúdo físico não corresponde aos metadados esperados.');
    }
    return actual;
  };

  const exclusiveDestination = async (sourcePath, destinationPath) => {
    try {
      await fs.link(sourcePath, destinationPath);
      return 'linked';
    } catch (error) {
      if (error?.code === 'EEXIST') return 'exists';
      throw error;
    }
  };

  const crossDeviceCopy = async (sourcePath, destinationPath, expected) => {
    const temporaryPath = `${destinationPath}.${randomId()}.part`;
    try {
      await fs.copyFile(sourcePath, temporaryPath, constants.COPYFILE_EXCL);
      await assertContent(temporaryPath, expected);
      const handle = await fs.open(temporaryPath, 'r+');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      const result = await exclusiveDestination(temporaryPath, destinationPath);
      if (result === 'exists') await assertContent(destinationPath, expected);
      await fs.rm(temporaryPath, { force: true });
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  };

  const moveVerified = async (sourceKey, sourceKind, destinationKey, destinationKind, integrity) => {
    const expected = requireIntegrity(integrity);
    const destinationPath = await resolveKey(destinationKey, destinationKind, { createParent: true });
    const destinationExists = await inspectPath(destinationPath, destinationKey, { includeSha256: true })
      .then((metadata) => metadata)
      .catch((error) => {
        if (error.code === CODES.NOT_FOUND) return null;
        throw error;
      });

    if (destinationExists) {
      if (
        destinationExists.sizeBytes !== expected.sizeBytes
        || destinationExists.sha256 !== expected.sha256
      ) {
        throw storageError(CODES.CONTENT_MISMATCH, 'O destino já existe com conteúdo diferente.');
      }
      const sourcePath = await resolveKey(sourceKey, sourceKind);
      await fs.rm(sourcePath, { force: true });
      return { key: destinationKey, ...expected, replayed: true };
    }

    const sourcePath = await resolveKey(sourceKey, sourceKind);
    await assertContent(sourcePath, expected);

    try {
      const result = await exclusiveDestination(sourcePath, destinationPath);
      if (result === 'exists') await assertContent(destinationPath, expected);
    } catch (error) {
      if (error?.code !== 'EXDEV') throw error;
      await crossDeviceCopy(sourcePath, destinationPath, expected);
    }

    await assertContent(destinationPath, expected);
    await fs.rm(sourcePath, { force: true });
    return { key: destinationKey, ...expected, replayed: false };
  };

  const adapter = {
    createStagingKey() {
      return `staging/${randomId()}.upload`;
    },

    createObjectKey() {
      const id = randomId();
      return `objects/${id.slice(0, 2)}/${id}.object`;
    },

    async writeStaging(stream, { key = adapter.createStagingKey(), signal } = {}) {
      requireReadableStream(stream);
      validateStorageKey(key, KINDS.STAGING);
      return withWriteSlot(async () => {
        const destinationPath = await resolveKey(key, KINDS.STAGING, { createParent: true });
        const temporaryPath = `${destinationPath}.${randomId()}.part`;
        let handle;
        let rejectInterruption;
        const interruption = new Promise((_, reject) => {
          rejectInterruption = reject;
        });
        const interrupt = () => rejectInterruption(storageError(
          CODES.TIMEOUT,
          'A operação de armazenamento foi interrompida.',
          { retryable: true },
        ));
        if (signal?.aborted) interrupt();
        else signal?.addEventListener('abort', interrupt, { once: true });
        const timer = setTimeout(interrupt, timeoutMs);
        timer.unref();
        try {
          const hash = createHash('sha256');
          let sizeBytes = 0;
          handle = await fs.open(
            temporaryPath,
            constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | NO_FOLLOW,
            0o600,
          );
          const iterator = stream[Symbol.asyncIterator]();
          for (;;) {
            const { done, value } = await Promise.race([iterator.next(), interruption]);
            if (done) break;
            const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
            sizeBytes += chunk.length;
            if (sizeBytes > maxBytes) {
              throw storageError(CODES.SIZE_LIMIT_EXCEEDED, 'O stream excede o limite técnico configurado.');
            }
            hash.update(chunk);
            await handle.write(chunk);
          }
          await handle.sync();
          await handle.close();
          handle = undefined;

          const result = await exclusiveDestination(temporaryPath, destinationPath);
          if (result === 'exists') {
            throw storageError(CODES.ALREADY_EXISTS, 'A chave de staging já está em uso.');
          }
          await fs.rm(temporaryPath, { force: true });
          return { key, sizeBytes, sha256: hash.digest('hex') };
        } catch (error) {
          await handle?.close().catch(() => undefined);
          await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
          throw mapIoError(error, 'Não foi possível gravar o arquivo temporário.');
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener('abort', interrupt);
        }
      });
    },

    async head(key, { includeSha256 = false } = {}) {
      try {
        const { kind } = validateStorageKey(key);
        const filePath = await resolveKey(key, kind);
        return await inspectPath(filePath, key, { includeSha256 });
      } catch (error) {
        throw mapIoError(error, 'Não foi possível consultar o objeto armazenado.');
      }
    },

    async exists(key) {
      try {
        await adapter.head(key);
        return true;
      } catch (error) {
        if (error.code === CODES.NOT_FOUND) return false;
        throw error;
      }
    },

    async promote(stagingKey, objectKey, integrity) {
      return withWriteSlot(async () => {
        try {
          return await moveVerified(stagingKey, KINDS.STAGING, objectKey, KINDS.OBJECT, integrity);
        } catch (error) {
          throw mapIoError(error, 'Não foi possível promover o arquivo temporário.');
        }
      });
    },

    async openReadStream(objectKey) {
      try {
        const filePath = await resolveKey(objectKey, KINDS.OBJECT);
        await inspectPath(filePath, objectKey);
        const source = createReadStream(filePath, { flags: constants.O_RDONLY | NO_FOLLOW });
        const output = new PassThrough();
        pipeline(source, output).catch((error) => {
          output.destroy(mapIoError(error, 'Não foi possível ler o objeto armazenado.'));
        });
        return output;
      } catch (error) {
        throw mapIoError(error, 'Não foi possível abrir o objeto armazenado.');
      }
    },

    async quarantine(key, { quarantineKey, ...integrity } = {}) {
      const { kind } = validateStorageKey(key);
      if (![KINDS.STAGING, KINDS.OBJECT].includes(kind)) {
        throw storageError(CODES.INVALID_KEY, 'Somente staging ou objeto definitivo pode ser colocado em quarentena.');
      }
      const id = randomId();
      const target = quarantineKey ?? `quarantine/${id.slice(0, 2)}/${id}.quarantine`;
      validateStorageKey(target, KINDS.QUARANTINE);
      return withWriteSlot(async () => {
        try {
          return await moveVerified(key, kind, target, KINDS.QUARANTINE, integrity);
        } catch (error) {
          throw mapIoError(error, 'Não foi possível colocar o objeto em quarentena.');
        }
      });
    },

    async removeTemporary(stagingKey) {
      validateStorageKey(stagingKey, KINDS.STAGING);
      return withWriteSlot(async () => {
        try {
          const filePath = await resolveKey(stagingKey, KINDS.STAGING);
          const existed = await adapter.exists(stagingKey);
          if (!existed) return { key: stagingKey, removed: false };
          await fs.rm(filePath, { force: true });
          return { key: stagingKey, removed: true };
        } catch (error) {
          if (error.code === CODES.NOT_FOUND) return { key: stagingKey, removed: false };
          throw mapIoError(error, 'Não foi possível remover o arquivo temporário.');
        }
      });
    },

    async listKeys(kind) {
      if (![KINDS.STAGING, KINDS.OBJECT, KINDS.QUARANTINE].includes(kind)) {
        throw storageError(CODES.INVALID_KEY, 'Tipo de chave inválido para listagem.');
      }
      await ensureLayout();
      const baseDir = path.join(root, kind);
      const keys = [];

      const safeReaddir = async (dir) => {
        try {
          return await fs.readdir(dir, { withFileTypes: true });
        } catch (err) {
          if (isMissing(err)) return [];
          throw mapIoError(err, 'Falha ao ler diretório do storage.');
        }
      };

      if (kind === KINDS.STAGING) {
        const entries = await safeReaddir(baseDir);
        for (const entry of entries) {
          if (entry.isFile()) {
            const candidateKey = `${kind}/${entry.name}`;
            try {
              validateStorageKey(candidateKey, kind);
              keys.push(candidateKey);
            } catch {
              // ignore non-matching or temp files
            }
          }
        }
      } else {
        const partitions = await safeReaddir(baseDir);
        for (const partition of partitions) {
          if (partition.isDirectory() && /^[0-9a-f]{2}$/i.test(partition.name)) {
            const partitionPath = path.join(baseDir, partition.name);
            const entries = await safeReaddir(partitionPath);
            for (const entry of entries) {
              if (entry.isFile()) {
                const candidateKey = `${kind}/${partition.name}/${entry.name}`;
                try {
                  validateStorageKey(candidateKey, kind);
                  keys.push(candidateKey);
                } catch {
                  // ignore non-matching or temp files
                }
              }
            }
          }
        }
      }

      return keys;
    },
  };

  return assertChatAttachmentStorage(adapter);
}

export const CHAT_ATTACHMENT_LOCAL_STORAGE_DEFAULTS = Object.freeze({
  maxBytes: DEFAULT_MAX_BYTES,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxConcurrentWrites: DEFAULT_MAX_CONCURRENT_WRITES,
});
