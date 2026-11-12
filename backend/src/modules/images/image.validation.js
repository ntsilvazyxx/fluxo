import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';

import { AppError } from '../../shared/errors/app-error.js';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_ACTIVE_IMAGES = 10;

const allowedByExtension = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

export async function inspectImage(file) {
  if (!file?.buffer?.length) {
    throw new AppError(400, 'IMAGE_REQUIRED', 'Selecione uma imagem para enviar.');
  }

  if (file.buffer.length > MAX_IMAGE_BYTES) {
    throw new AppError(413, 'IMAGE_TOO_LARGE', 'A imagem deve ter no mÃ¡ximo 10 MB.');
  }

  const extension = path.extname(file.originalname ?? '').toLowerCase();
  const expectedMime = allowedByExtension.get(extension);
  if (!expectedMime) {
    throw new AppError(422, 'IMAGE_EXTENSION_NOT_ALLOWED', 'Envie uma imagem JPG, JPEG, PNG ou WEBP.');
  }

  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || detected.mime !== expectedMime) {
    throw new AppError(422, 'IMAGE_CONTENT_MISMATCH', 'A extensÃ£o nÃ£o corresponde ao conteÃºdo real da imagem.');
  }

  return {
    mimeType: detected.mime,
    extension: detected.ext === 'jpg' ? '.jpg' : `.${detected.ext}`,
    sizeBytes: file.buffer.length,
    checksum: createHash('sha256').update(file.buffer).digest('hex'),
  };
}
