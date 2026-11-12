import { requireIdempotencyKey } from '../../shared/http/idempotency.js';

export const createImageController = ({ service }) => ({
  list: async (request, response) => {
    const result = await service.list(request.auth, request.validated.params.id);
    response.json({ data: result });
  },
  upload: async (request, response) => {
    const result = await service.upload(
      request,
      request.validated.params.id,
      request.file,
      request.validated.body,
      requireIdempotencyKey(request),
    );
    response
      .status(result.status)
      .set('idempotency-replayed', String(result.replayed))
      .json({ data: { image: result.body } });
  },
  content: async (request, response) => {
    const result = await service.content(request.auth, request.validated.params.id);
    response
      .status(200)
      .set({
        'content-type': result.mimeType,
        'content-length': String(result.sizeBytes),
        'content-disposition': `inline; filename="${result.fileName}"`,
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
      })
      .send(result.body);
  },
  remove: async (request, response) => {
    const result = await service.remove(
      request,
      request.validated.params.id,
      request.validated.body,
      requireIdempotencyKey(request),
    );
    response
      .status(result.status)
      .set('idempotency-replayed', String(result.replayed))
      .json({ data: { image: result.body } });
  },
});
