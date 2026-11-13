import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function createAttachmentStorage(rootPath) {
  const root = path.resolve(rootPath ?? 'storage/attachments');
  const resolve = (key) => { const full = path.resolve(root, key); if (!full.startsWith(`${root}${path.sep}`)) throw new Error('Chave de armazenamento inválida.'); return full; };
  const ensure = (key) => mkdir(path.dirname(resolve(key)), { recursive: true });
  return { createKeys(extension) { const id = randomUUID(); return { stagingKey: path.posix.join('staging', `${id}.upload`), storageKey: path.posix.join('objects', id.slice(0, 2), `${id}${extension}`) }; }, resolve(key) { return resolve(key); }, async moveFromTemporary(filePath, stagingKey) { await ensure(stagingKey); await rename(filePath, resolve(stagingKey)); }, async promote(stagingKey, storageKey) { await ensure(storageKey); try { await rename(resolve(stagingKey), resolve(storageKey)); } catch (error) { if (error.code !== 'ENOENT') throw error; await stat(resolve(storageKey)); } }, async remove(key) { if (key) await rm(resolve(key), { force: true }); }, stream(key) { return createReadStream(resolve(key)); } };
}
