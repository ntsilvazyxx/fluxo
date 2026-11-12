export const createNotificationController = ({ service }) => ({
  list: async (request, response) => {
    const result = await service.list(
      request.auth,
      request.validated.query,
    );
    response.json({ data: result });
  },
  markRead: async (request, response) => {
    const result = await service.markRead(
      request.auth,
      request.validated.params.id,
    );
    response.json({ data: result });
  },
  markReadAll: async (request, response) => {
    const result = await service.markReadAll(request.auth);
    response.json({ data: result });
  },
});
