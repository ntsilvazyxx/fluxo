export const REFRESH_COOKIE_NAME = 'seaf_refresh';

export const refreshCookieOptions = (config) => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'strict',
  path: '/api/v1/auth',
  maxAge: config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
});

export const clearRefreshCookieOptions = (config) => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'strict',
  path: '/api/v1/auth',
});
