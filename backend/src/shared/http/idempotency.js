import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import { runCriticalTransaction } from '../../infrastructure/database/transaction.js';

const digest = (payload) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');
export const requireIdempotencyKey = (request) => {
  const key = request.get('idempotency-key');
  if (!key || key.length > 255) throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Envie um Idempotency-Key válido.');
  return key;
};
export async function executeIdempotent(prisma, { actorId, key, payload, status = 200, operation }) {
  const requestHash = digest(payload);
  try {
    return await runCriticalTransaction(prisma, async (tx) => {
      await tx.idempotencyKey.create({ data: { id: randomUUID(), actorId, key, requestHash, expiresAt: new Date(Date.now()+86_400_000) } });
      const body = await operation(tx);
      await tx.idempotencyKey.update({ where: { actorId_key: { actorId, key } }, data: { state: 'COMPLETED', responseStatus: status, responseBodyJson: body } });
      return { body, status, replayed: false };
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const existing = await prisma.idempotencyKey.findUnique({ where: { actorId_key: { actorId, key } } });
    if (!existing) throw error;
    if (existing.requestHash !== requestHash) throw new AppError(409, 'IDEMPOTENCY_KEY_CONFLICT', 'A chave já foi usada com outro conteúdo.');
    if (existing.state !== 'COMPLETED') throw new AppError(409, 'IDEMPOTENCY_IN_PROGRESS', 'A operação ainda está em processamento.');
    return { body: existing.responseBodyJson, status: existing.responseStatus, replayed: true };
  }
}
