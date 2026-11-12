import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { createFileImageStorage } from '../../src/modules/images/image.storage.js';
import { inspectImage, MAX_IMAGE_BYTES } from '../../src/modules/images/image.validation.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('validaÃ§Ã£o e armazenamento privado de imagens', () => {
  it('reconhece o conteÃºdo real e calcula checksum', async () => {
    const result = await inspectImage({ originalname: 'evidencia.png', buffer: png });
    assert.equal(result.mimeType, 'image/png');
    assert.equal(result.extension, '.png');
    assert.equal(result.checksum.length, 64);
  });

  it('rejeita extensÃ£o divergente da assinatura e arquivo excessivo', async () => {
    await assert.rejects(
      inspectImage({ originalname: 'evidencia.jpg', buffer: png }),
      (error) => error.code === 'IMAGE_CONTENT_MISMATCH',
    );
    await assert.rejects(
      inspectImage({ originalname: 'grande.png', buffer: Buffer.alloc(MAX_IMAGE_BYTES + 1) }),
      (error) => error.code === 'IMAGE_TOO_LARGE',
    );
  });

  it('gera chaves aleatÃ³rias e impede path traversal', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seaf-storage-unit-'));
    try {
      const storage = createFileImageStorage(root);
      const first = storage.createKeys('.png');
      const second = storage.createKeys('.png');
      assert.notEqual(first.storageKey, second.storageKey);
      assert.equal(first.storageKey.includes('..'), false);
      await assert.rejects(storage.read('../../fora.png'), /invÃ¡lida/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
