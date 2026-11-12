import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const inside = (root, candidate) => candidate === root || candidate.startsWith(`${root}${path.sep}`);

export function createFileImageStorage(rootPath) {
  const root = path.resolve(rootPath ?? 'storage/images');

  const resolveKey = (key) => {
    const resolved = path.resolve(root, key);
    if (!inside(root, resolved)) throw new Error('Chave de armazenamento invÃ¡lida.');
    return resolved;
  };

  const ensure = async (key) => mkdir(path.dirname(resolveKey(key)), { recursive: true });
  const remove = async (key) => {
    if (!key) return;
    await rm(resolveKey(key), { force: true });
  };

  return {
    createKeys(extension) {
      const id = randomUUID();
      return {
        stagingKey: path.posix.join('staging', `${id}.upload`),
        storageKey: path.posix.join('objects', id.slice(0, 2), `${id}${extension}`),
      };
    },
    async stage(key, buffer) {
      await ensure(key);
      await writeFile(resolveKey(key), buffer, { flag: 'wx' });
    },
    async promote(stagingKey, storageKey) {
      await ensure(storageKey);
      try {
        await rename(resolveKey(stagingKey), resolveKey(storageKey));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await stat(resolveKey(storageKey));
      }
    },
    remove,
    async read(storageKey) {
      return readFile(resolveKey(storageKey));
    },
  };
}
