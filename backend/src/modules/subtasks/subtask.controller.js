import { requireIdempotencyKey } from '../../shared/http/idempotency.js';

export const createSubtaskController = ({ service }) => ({
  list: async (request, response) => {
    response.json({ data: { subtasks: await service.list(request.auth, request.validated.params.id) } });
  },
  create: async (request, response) => {
    const result = await service.create(
      request,
      request.validated.params.id,
      request.validated.body,
      requireIdempotencyKey(request),
    );
    response
      .status(result.status)
      .set('idempotency-replayed', String(result.replayed))
      .json({ data: { subtask: result.body } });
  },
});
