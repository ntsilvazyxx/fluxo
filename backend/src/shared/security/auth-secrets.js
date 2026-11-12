import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError } from '../errors/app-error.js';
export function encryptionKey(config) {
  if (!/^[a-f0-9]{64}$/i.test(config.authDataEncryptionKey ?? '')) throw new AppError(503, 'AUTH_SECURITY_NOT_CONFIGURED', 'Segurança de autenticação não configurada.');
  return Buffer.from(config.authDataEncryptionKey, 'hex');
}
export function seal(value, context, config) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(config), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}
export function unseal(value, context, config) {
  const [iv, tag, data] = value.split('.').map((s) => Buffer.from(s, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(config), iv); cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
