import { createHash, randomBytes } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

const encoder = new TextEncoder();

export const generateOpaqueToken = () => randomBytes(32).toString('base64url');

export const hashOpaqueToken = (token) =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export const signAccessToken = async ({ userId, sessionId, roleCode }, config) =>
  new SignJWT({ sid: sessionId, role: roleCode })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
    .sign(encoder.encode(config.jwtAccessSecret));

export const verifyAccessToken = async (token, config) => {
  const { payload } = await jwtVerify(token, encoder.encode(config.jwtAccessSecret), {
    algorithms: ['HS256'],
  });

  return payload;
};
