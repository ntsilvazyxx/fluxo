import { Prisma } from '@prisma/client';

import { AppError } from '../shared/errors/app-error.js';

export const errorHandler = (error, request, response, _next) => {
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

  console.error(error);

  response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Ocorreu um erro interno.',
      correlationId: request.correlationId,
    },
  });
};
