import { AppError } from '../shared/errors/app-error.js';
import { verifyAccessToken } from '../shared/security/tokens.js';

const unauthorized = () =>
  new AppError(401, 'AUTHENTICATION_REQUIRED', 'Entre para continuar.');

export const authenticate = ({ prisma, config }) => async (request, _response, next) => {
  try {
    const authorization = request.get('authorization');

    if (!authorization?.startsWith('Bearer ')) {
      throw unauthorized();
    }

    const payload = await verifyAccessToken(authorization.slice(7), config);

    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      throw unauthorized();
    }

    const session = await prisma.userSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { isActive: true, deletedAt: null },
      },
      include: { user: { include: { role: true } } },
    });

    if (!session) {
      throw unauthorized();
    }

    request.auth = {
      userId: session.user.id,
      sessionId: session.id,
      roleCode: session.user.role.code,
      user: session.user,
    };
    next();
  } catch (error) {
    next(error instanceof AppError ? error : unauthorized());
  }
};
