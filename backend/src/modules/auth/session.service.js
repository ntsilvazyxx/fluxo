import { randomUUID } from 'node:crypto';
import { generateOpaqueToken, hashOpaqueToken, signAccessToken } from '../../shared/security/tokens.js';
import { presentUser } from '../users/user.presenter.js';
export async function issueSession(tx, user, config) {
  const refreshToken = generateOpaqueToken(); const sessionId = randomUUID();
  await tx.userSession.create({ data: { id: sessionId, userId: user.id, refreshTokenHash: hashOpaqueToken(refreshToken), expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 86400000) } });
  return { accessToken: await signAccessToken({ userId: user.id, sessionId, roleCode: user.role.code }, config), expiresIn: config.accessTokenTtlSeconds, refreshToken, user: presentUser(user) };
}
export const authAudit = (tx, userId, action, entityId = userId) => tx.auditEvent.create({ data: { id: randomUUID(), actorId: userId, entityType: 'Authentication', entityId, action, correlationId: randomUUID() } });
