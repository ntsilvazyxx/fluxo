import { randomUUID } from 'node:crypto';

export const correlationId = (request, response, next) => {
  const incoming = request.get('x-correlation-id');
  request.correlationId = incoming?.slice(0, 100) || randomUUID();
  response.set('x-correlation-id', request.correlationId);
  next();
};
