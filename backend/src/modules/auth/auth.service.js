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

    const refreshToken = generateOpaqueToken();
    const sessionId = randomUUID();
    const expiresAt = expiresFromNow(config.refreshTokenTtlDays * 86_400_000);

    await prisma.userSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: hashOpaqueToken(refreshToken),
        expiresAt,
      },
    });

    const accessToken = await signAccessToken(
      { userId: user.id, sessionId, roleCode: user.role.code },
      config,
    );

    return {
      accessToken,
      expiresIn: config.accessTokenTtlSeconds,
      refreshToken,
      user: presentUser(user),
    };
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
    const user = await prisma.user.findFirst({
      where: {
        emailNormalized: email.trim().toLowerCase(),
        isActive: true,
        deletedAt: null,
      },
    });

    if (!user) return;

    const token = generateOpaqueToken();
    const now = new Date();

    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      }),
      prisma.passwordResetToken.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          tokenHash: hashOpaqueToken(token),
          expiresAt: expiresFromNow(config.passwordResetTtlMinutes * 60_000),
        },
      }),
    ]);

    await passwordResetNotifier({ email: user.emailNormalized, token });
  },

  async resetPassword({ token, password }) {
    const tokenHash = hashOpaqueToken(token);
    const passwordHash = await hashPassword(password);

    await prisma.$transaction(
      async (transaction) => {
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
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5_000, timeout: 10_000 },
    );
  },
});
