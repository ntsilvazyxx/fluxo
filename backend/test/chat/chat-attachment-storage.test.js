import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  copyFile,
  link,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  CHAT_ATTACHMENT_STORAGE_ERROR_CODES as CODES,
  CHAT_ATTACHMENT_STORAGE_KINDS as KINDS,
  assertChatAttachmentStorage,
  validateStorageKey,
} from '../../src/modules/chat/chat-attachment-storage.contract.js';
import { createLocalChatAttachmentStorage } from '../../src/modules/chat/chat-attachment.local-storage.js';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const integrity = (value) => ({ sizeBytes: value.length, sha256: digest(value) });
const fixedKey = (kind, id = randomUUID()) => {
  if (kind === KINDS.STAGING) return `staging/${id}.upload`;
  if (kind === KINDS.OBJECT) return `objects/${id.slice(0, 2)}/${id}.object`;
  return `quarantine/${id.slice(0, 2)}/${id}.quarantine`;
};

describe('storage privado local dos anexos do Chat — Fase 5.1.1', () => {
  let root;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'seaf-chat-storage-test-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('implementa integralmente o contrato sem depender de Express ou Prisma', () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root });
    assert.equal(assertChatAttachmentStorage(storage), storage);
  });

  it('gera chaves opacas, aleatórias e separadas por namespace', () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root });
    const staging = storage.createStagingKey();
    const first = storage.createObjectKey();
    const second = storage.createObjectKey();
    assert.equal(validateStorageKey(staging, KINDS.STAGING).kind, KINDS.STAGING);
    assert.equal(validateStorageKey(first, KINDS.OBJECT).kind, KINDS.OBJECT);
    assert.notEqual(first, second);
    assert.doesNotMatch(first, /relatorio|original|usuario/i);
  });

  it('rejeita traversal, caminho absoluto, drive Windows, backslash e chaves malformadas', () => {
    for (const key of [
      '../outside',
      '/etc/passwd',
      'C:/Windows/system.ini',
      'objects\\aa\\file.object',
      'objects/aa/../../outside.object',
      'objects/aa/not-a-uuid.object',
      'unknown/00000000-0000-4000-8000-000000000000.object',
    ]) {
      assert.throws(() => validateStorageKey(key), (error) => error.code === CODES.INVALID_KEY);
    }
  });

  it('grava e lê arquivo pequeno por streaming sem expor caminho físico', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root });
    const content = Buffer.from('conteúdo institucional sintético');
    const written = await storage.writeStaging(Readable.from([content]));
    const objectKey = storage.createObjectKey();
    await storage.promote(written.key, objectKey, written);
    const chunks = [];
    for await (const chunk of await storage.openReadStream(objectKey)) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), content);
    assert.equal('path' in written, false);
    assert.equal(written.sha256, digest(content));
  });

  it('processa arquivo maior em chunks e retorna metadados físicos com integridade opcional', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root, maxBytes: 5 * 1024 * 1024 });
    const chunks = Array.from({ length: 12 }, (_, index) => Buffer.alloc(256 * 1024, index));
    const content = Buffer.concat(chunks);
    const written = await storage.writeStaging(Readable.from(chunks));
    const metadata = await storage.head(written.key, { includeSha256: true });
    assert.equal(metadata.sizeBytes, content.length);
    assert.equal(metadata.sha256, digest(content));
    assert.equal(await storage.exists(written.key), true);
  });

  it('interrompe stream acima do limite técnico e limpa arquivos parciais', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root, maxBytes: 10 });
    const key = storage.createStagingKey();
    const oversizedStream = {
      pipe() {},
      async *[Symbol.asyncIterator]() {
        yield Buffer.alloc(6);
        yield Buffer.alloc(6);
      },
    };
    await assert.rejects(
      storage.writeStaging(oversizedStream, { key }),
      (error) => error.code === CODES.SIZE_LIMIT_EXCEEDED,
    );
    assert.equal(await storage.exists(key), false);
    assert.deepEqual((await readdir(path.join(root, 'staging'))).filter((name) => name.includes('.part')), []);
  });

  it('limpa arquivo parcial quando o stream de origem falha', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root });
    const key = storage.createStagingKey();
    const interruptedStream = {
      pipe() {},
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('parcial');
        throw new Error('falha sintética');
      },
    };
    await assert.rejects(
      storage.writeStaging(interruptedStream, { key }),
      (error) => error.code === CODES.IO_FAILURE,
    );
    assert.equal(await storage.exists(key), false);
    assert.deepEqual((await readdir(path.join(root, 'staging'))).filter((name) => name.includes('.part')), []);
  });

  it('aplica timeout a stream interrompido e limpa o temporário', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root, timeoutMs: 25 });
    const key = storage.createStagingKey();
    const stream = new PassThrough();
    const writing = storage.writeStaging(stream, { key });
    stream.write('sem encerramento');
    await assert.rejects(writing, (error) => error.code === CODES.TIMEOUT);
    assert.equal(await storage.exists(key), false);
  });

  it('não sobrescreve uma chave de staging existente em caso de colisão', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root });
    const key = storage.createStagingKey();
    await storage.writeStaging(Readable.from(['primeiro']), { key });
    await assert.rejects(
      storage.writeStaging(Readable.from(['segundo']), { key }),
      (error) => error.code === CODES.ALREADY_EXISTS,
    );
    const metadata = await storage.head(key, { includeSha256: true });
    assert.equal(metadata.sha256, digest('primeiro'));
  });

  it('promove normalmente, remove staging e preserva conteúdo', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root });
    const content = Buffer.from('promoção normal');
    const staged = await storage.writeStaging(Readable.from([content]));
    const objectKey = storage.createObjectKey();
    const promoted = await storage.promote(staged.key, objectKey, staged);
    assert.equal(promoted.replayed, false);
    assert.equal(await storage.exists(staged.key), false);
    assert.equal((await storage.head(objectKey, { includeSha256: true })).sha256, digest(content));
  });

  it('trata promoção repetida como replay idempotente', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root });
    const staged = await storage.writeStaging(Readable.from(['idempotente']));
    const objectKey = storage.createObjectKey();
    await storage.promote(staged.key, objectKey, staged);
    const replay = await storage.promote(staged.key, objectKey, staged);
    assert.equal(replay.replayed, true);
  });

  it('aceita destino existente com o mesmo conteúdo e remove staging redundante', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root });
    const objectKey = storage.createObjectKey();
    const first = await storage.writeStaging(Readable.from(['igual']));
    await storage.promote(first.key, objectKey, first);
    const second = await storage.writeStaging(Readable.from(['igual']));
    const replay = await storage.promote(second.key, objectKey, second);
    assert.equal(replay.replayed, true);
    assert.equal(await storage.exists(second.key), false);
  });

  it('rejeita destino existente com conteúdo diferente sem alterar origem ou destino', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root });
    const objectKey = storage.createObjectKey();
    const first = await storage.writeStaging(Readable.from(['original']));
    await storage.promote(first.key, objectKey, first);
    const second = await storage.writeStaging(Readable.from(['diferente']));
    await assert.rejects(
      storage.promote(second.key, objectKey, second),
      (error) => error.code === CODES.CONTENT_MISMATCH,
    );
    assert.equal(await storage.exists(second.key), true);
    assert.equal((await storage.head(objectKey, { includeSha256: true })).sha256, digest('original'));
  });

  it('retorna NOT_FOUND quando origem e destino da promoção não existem', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root });
    await assert.rejects(
      storage.promote(fixedKey(KINDS.STAGING), fixedKey(KINDS.OBJECT), integrity(Buffer.from('ausente'))),
      (error) => error.code === CODES.NOT_FOUND,
    );
  });

  it('executa fallback EXDEV com cópia verificada antes de remover a origem', async () => {
    let firstPromotionLink = true;
    const storage = createLocalChatAttachmentStorage({
      rootPath: root,
      operations: {
        async link(...args) {
          if (firstPromotionLink && args[0].endsWith('.upload') && args[1].endsWith('.object')) {
            firstPromotionLink = false;
            const error = new Error('cross-device');
            error.code = 'EXDEV';
            throw error;
          }
          return link(...args);
        },
      },
    });
    const content = Buffer.from('fallback entre volumes');
    const staged = await storage.writeStaging(Readable.from([content]));
    const objectKey = storage.createObjectKey();
    await storage.promote(staged.key, objectKey, staged);
    assert.equal(await storage.exists(staged.key), false);
    assert.equal((await storage.head(objectKey, { includeSha256: true })).sha256, digest(content));
  });

  it('preserva a origem e permite retry após falha intermediária no fallback EXDEV', async () => {
    let failCopy = true;
    const storage = createLocalChatAttachmentStorage({
      rootPath: root,
      operations: {
        async link(source, destination) {
          if (source.endsWith('.upload')) {
            const error = new Error('cross-device');
            error.code = 'EXDEV';
            throw error;
          }
          return link(source, destination);
        },
        async copyFile(source, destination, flags) {
          if (failCopy) {
            failCopy = false;
            await writeFile(destination, 'parcial', { flag: 'wx' });
            throw new Error('falha de cópia sintética');
          }
          return copyFile(source, destination, flags);
        },
      },
    });
    const content = Buffer.from('recuperável');
    const staged = await storage.writeStaging(Readable.from([content]));
    const objectKey = storage.createObjectKey();
    await assert.rejects(storage.promote(staged.key, objectKey, staged), (error) => error.code === CODES.IO_FAILURE);
    assert.equal(await storage.exists(staged.key), true);
    assert.equal(await storage.exists(objectKey), false);
    await storage.promote(staged.key, objectKey, staged);
    assert.equal((await storage.head(objectKey, { includeSha256: true })).sha256, digest(content));
  });

  it('move staging para quarentena e aceita replay com a mesma chave de destino', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root });
    const staged = await storage.writeStaging(Readable.from(['quarentena']));
    const quarantineKey = fixedKey(KINDS.QUARANTINE);
    const first = await storage.quarantine(staged.key, { quarantineKey, ...staged });
    const replay = await storage.quarantine(staged.key, { quarantineKey, ...staged });
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(await storage.exists(quarantineKey), true);
    assert.equal(await storage.exists(staged.key), false);
  });

  it('remove somente temporários e torna a remoção repetida idempotente', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root });
    const staged = await storage.writeStaging(Readable.from(['temporário']));
    assert.equal((await storage.removeTemporary(staged.key)).removed, true);
    assert.equal((await storage.removeTemporary(staged.key)).removed, false);
    await assert.rejects(
      storage.removeTemporary(fixedKey(KINDS.OBJECT)),
      (error) => error.code === CODES.INVALID_KEY,
    );
  });

  it('recusa leitura de objeto inexistente com erro sanitizado', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root });
    await assert.rejects(
      storage.openReadStream(fixedKey(KINDS.OBJECT)),
      (error) => error.code === CODES.NOT_FOUND && !error.message.includes(root),
    );
  });

  it('recusa junction/symlink em diretório interno e não alcança arquivo externo', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root });
    await storage.exists(fixedKey(KINDS.OBJECT));
    const outside = await mkdtemp(path.join(os.tmpdir(), 'seaf-chat-storage-outside-'));
    try {
      const identifier = 'aa000000-0000-4000-8000-000000000000';
      const key = fixedKey(KINDS.OBJECT, identifier);
      const linkPath = path.join(root, 'objects', 'aa');
      await symlink(outside, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
      await writeFile(path.join(outside, `${identifier}.object`), 'externo');
      await assert.rejects(
        storage.head(key),
        (error) => error.code === CODES.SYMLINK_NOT_ALLOWED,
      );
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('recusa diretório-base configurado como junction/symlink', async () => {
    const target = await mkdtemp(path.join(os.tmpdir(), 'seaf-chat-storage-target-'));
    const linkRoot = `${root}-link`;
    try {
      await symlink(target, linkRoot, process.platform === 'win32' ? 'junction' : 'dir');
      const storage = createLocalChatAttachmentStorage({ rootPath: linkRoot });
      await assert.rejects(
        storage.exists(fixedKey(KINDS.STAGING)),
        (error) => error.code === CODES.SYMLINK_NOT_ALLOWED,
      );
    } finally {
      await rm(linkRoot, { recursive: true, force: true });
      await rm(target, { recursive: true, force: true });
    }
  });

  it('serializa escritas quando o limite de concorrência é um', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root, maxConcurrentWrites: 1 });
    const firstKey = storage.createStagingKey();
    const secondKey = storage.createStagingKey();
    const firstStream = new PassThrough();
    const firstWrite = storage.writeStaging(firstStream, { key: firstKey });
    firstStream.write('primeiro');
    const secondWrite = storage.writeStaging(Readable.from(['segundo']), { key: secondKey });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(await storage.exists(secondKey), false);
    firstStream.end();
    await Promise.all([firstWrite, secondWrite]);
    assert.equal(await storage.exists(firstKey), true);
    assert.equal(await storage.exists(secondKey), true);
  });

  it('não cria nem utiliza os diretórios operacionais existentes durante os testes', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root });
    const staged = await storage.writeStaging(Readable.from(['isolado']));
    const physical = path.join(root, ...staged.key.split('/'));
    assert.equal((await readFile(physical, 'utf8')), 'isolado');
    assert.match(root, /seaf-chat-storage-test-/);
    assert.doesNotMatch(root, /backend[\\/]storage[\\/](attachments|images)/i);
  });

  it('lista chaves internas com listKeys(kind) para staging, objects e quarantine', async () => {
    const storage = createLocalChatAttachmentStorage({ rootPath: root });
    const staged1 = await storage.writeStaging(Readable.from(['d1']));
    const staged2 = await storage.writeStaging(Readable.from(['d2']));

    const objKey1 = storage.createObjectKey();
    await storage.promote(staged1.key, objKey1, { sizeBytes: staged1.sizeBytes, sha256: staged1.sha256 });

    const qKey1 = `quarantine/${randomUUID().slice(0, 2)}/${randomUUID()}.quarantine`;
    await storage.quarantine(staged2.key, { quarantineKey: qKey1, sizeBytes: staged2.sizeBytes, sha256: staged2.sha256 });

    const stagingKeys = await storage.listKeys('staging');
    const objectKeys = await storage.listKeys('objects');
    const quarantineKeys = await storage.listKeys('quarantine');

    assert.equal(stagingKeys.length, 0); // Both were promoted / quarantined
    assert.deepEqual(objectKeys, [objKey1]);
    assert.deepEqual(quarantineKeys, [qKey1]);
  });
});
