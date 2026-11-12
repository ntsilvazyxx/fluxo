import { Prisma } from '@prisma/client';

import { AppError } from '../shared/errors/app-error.js';

export const errorHandler = (error, request, response, _next) => {
  if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
    const tooLarge = error.type === 'entity.too.large';
    response.status(tooLarge ? 413 : 400).json({ error: {
      code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
      message: tooLarge ? 'O corpo da requisição excede o limite.' : 'JSON inválido.',
      correlationId: request.correlationId,
    } });
    return;
  }
  if (error instanceof AppError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
        correlationId: request.correlationId,
      },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    response.status(409).json({ error: { code: 'CONFLICT', message: 'Registro duplicado.', correlationId: request.correlationId } });
    return;
  }

  // Never log payloads, Prisma query arguments, passwords or tokens.
  console.error(JSON.stringify({ event: 'request_error', correlationId: request.correlationId,
    type: error.name ?? 'Error', code: error.code ?? 'INTERNAL_SERVER_ERROR' }));

  response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Ocorreu um erro interno.',
      correlationId: request.correlationId,
    },
  });
};
