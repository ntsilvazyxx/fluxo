import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

import { AppError } from '../../shared/errors/app-error.js';
import { hashPassword, verifyPassword } from '../../shared/security/password.js';
import {
  generateOpaqueToken,
  hashOpaqueToken,
  signAccessToken,
} from '../../shared/security/tokens.js';
import { presentUser } from '../users/user.presenter.js';
import { authAudit, issueSession } from './session.service.js';
import { encryptionKey, seal } from '../../shared/security/auth-secrets.js';

const dummyPasswordHash = hashPassword('Invalid-password-for-timing-only-2026');

const authenticationError = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');

const refreshError = () =>
  new AppError(401, 'INVALID_REFRESH_TOKEN', 'Sua sessão expirou. Entre novamente.');

const expiresFromNow = (milliseconds) => new Date(Date.now() + milliseconds);

export const createAuthService = ({ prisma, config, passwordResetNotifier }) => ({
  async login({ email, password }) {
    const emailNormalized = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { emailNormalized },
      include: { role: true },
    });
    const passwordMatches = await verifyPassword(
      user?.passwordHash ?? (await dummyPasswordHash),
      password,
    );

    if (!user || !passwordMatches || !user.isActive || user.deletedAt) {
      throw authenticationError();
    }

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id=${user.id} FOR UPDATE`);
      const current = await tx.user.findFirst({ where: { id: user.id, isActive: true, deletedAt: null }, include: { role: true } });
      if (!current || current.version !== user.version || current.passwordHash !== user.passwordHash) throw authenticationError();
      const session = await issueSession(tx, current, config);
      await authAudit(tx, user.id, 'LOGIN_SUCCEEDED'); return session;
    });
  },

  async refresh(refreshToken) {
    if (!refreshToken) {
      throw refreshError();
    }

    const currentHash = hashOpaqueToken(refreshToken);
    const nextRefreshToken = generateOpaqueToken();
    const nextHash = hashOpaqueToken(nextRefreshToken);

    const result = await prisma.$transaction(
      async (transaction) => {
        const sessions = await transaction.$queryRaw(
          Prisma.sql`SELECT id, userId, expiresAt, revokedAt
            FROM user_sessions
            WHERE refreshTokenHash = ${currentHash}
            FOR UPDATE`,
        );
        const session = sessions[0];

        if (!session || session.revokedAt || new Date(session.expiresAt) <= new Date()) {
          throw refreshError();
        }

        const user = await transaction.user.findFirst({
          where: { id: session.userId, isActive: true, deletedAt: null },
          include: { role: true },
        });

        if (!user) {
          throw refreshError();
        }

        const rotated = await transaction.userSession.updateMany({
          where: { id: session.id, refreshTokenHash: currentHash, revokedAt: null },
          data: { refreshTokenHash: nextHash },
        });

        if (rotated.count !== 1) {
          throw refreshError();
        }

        return { sessionId: session.id, user };
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5_000, timeout: 10_000 },
    );

    return {
      accessToken: await signAccessToken(
        {
          userId: result.user.id,
          sessionId: result.sessionId,
          roleCode: result.user.role.code,
        },
        config,
      ),
      expiresIn: config.accessTokenTtlSeconds,
      refreshToken: nextRefreshToken,
      user: presentUser(result.user),
    };
  },

  async logout(refreshToken) {
    if (!refreshToken) return;

    await prisma.userSession.updateMany({
      where: { refreshTokenHash: hashOpaqueToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  async requestPasswordReset(email) {
    if (!passwordResetNotifier) encryptionKey(config);
    const user = await prisma.user.findFirst({ where: { emailNormalized: email.trim().toLowerCase(), isActive: true, deletedAt: null } });
    if (!user) return;
    const token = generateOpaqueToken(); const id = randomUUID(); const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id=${user.id} FOR UPDATE`);
      const active = await tx.user.findFirst({ where: { id: user.id, isActive: true, deletedAt: null } });
      if (!active) return;
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
      await tx.passwordResetToken.create({ data: { id, userId: user.id, tokenHash: hashOpaqueToken(token), expiresAt: expiresFromNow(config.passwordResetTtlMinutes * 60000) } });
      if (!passwordResetNotifier) await tx.outboxEvent.create({ data: { id: randomUUID(), eventType: 'PASSWORD_RESET_REQUESTED', dedupeKey: 'password-reset:' + id, payloadJson: { resetId: id, tokenCiphertext: seal(token, id, config) } } });
      await authAudit(tx, user.id, 'PASSWORD_RESET_REQUESTED', id);
    }, { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 });
    if (passwordResetNotifier) await passwordResetNotifier({ email: user.emailNormalized, token });
  },

  async resetPassword({ token, password }) {
    const tokenHash = hashOpaqueToken(token);
    const passwordHash = await hashPassword(password);
    const pointer = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!pointer) throw new AppError(400, 'INVALID_RESET_TOKEN', 'Token inválido ou expirado.');

    await prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id=${pointer.userId} FOR UPDATE`);
        const activeUser = await transaction.user.findFirst({ where: { id: pointer.userId, isActive: true, deletedAt: null } });
        if (!activeUser) throw new AppError(400, 'INVALID_RESET_TOKEN', 'Token inválido ou expirado.');
        const tokens = await transaction.$queryRaw(
          Prisma.sql`SELECT id, userId, expiresAt, usedAt
            FROM password_reset_tokens
            WHERE tokenHash = ${tokenHash}
            FOR UPDATE`,
        );
        const resetToken = tokens[0];

        if (
          !resetToken ||
          resetToken.usedAt ||
          new Date(resetToken.expiresAt) <= new Date()
        ) {
          throw new AppError(400, 'INVALID_RESET_TOKEN', 'Token inválido ou expirado.');
        }

        await transaction.user.update({
          where: { id: resetToken.userId },
          data: { passwordHash, version: { increment: 1 } },
        });
        await transaction.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { usedAt: new Date() },
        });
        await transaction.userSession.updateMany({
          where: { userId: resetToken.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await transaction.passwordResetToken.updateMany({ where: { userId: resetToken.userId, usedAt: null }, data: { usedAt: new Date() } });
        await authAudit(transaction, resetToken.userId, 'PASSWORD_RESET_COMPLETED', resetToken.id);
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5_000, timeout: 10_000 },
    );
  },
});
