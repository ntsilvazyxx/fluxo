import {
  clearRefreshCookieOptions,
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
} from '../../shared/security/cookies.js';
import { presentUser } from '../users/user.presenter.js';

const sendSession = (response, session, config) => {
  response.cookie(
    REFRESH_COOKIE_NAME,
    session.refreshToken,
    refreshCookieOptions(config),
  );
  response.status(200).json({
    data: {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
    },
  });
};

export const createAuthController = ({ service, config }) => ({
  login: async (request, response) => {
    sendSession(response, await service.login(request.validated.body), config);
  },

  refresh: async (request, response) => {
    sendSession(
      response,
      await service.refresh(request.cookies[REFRESH_COOKIE_NAME]),
      config,
    );
  },

  logout: async (request, response) => {
    await service.logout(request.cookies[REFRESH_COOKIE_NAME]);
    response.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions(config));
    response.status(204).send();
  },

  me: async (request, response) => {
    response.status(200).json({ data: { user: presentUser(request.auth.user) } });
  },

  forgotPassword: async (request, response) => {
    await service.requestPasswordReset(request.validated.body.email);
    response.status(202).json({
      data: {
        message: 'Se a conta existir, as instruções de recuperação serão enviadas.',
      },
    });
  },

  resetPassword: async (request, response) => {
    await service.resetPassword(request.validated.body);
    response.status(204).send();
  },
});
