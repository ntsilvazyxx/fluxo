export const createPreferenceController = ({ service }) => ({
  listKanbanColors: async (request, response) => {
    const result = await service.listKanbanColors(
      request.auth,
      request.validated.query,
    );
    response.json({ data: result });
  },

  updateKanbanColor: async (request, response) => {
    const result = await service.updateKanbanColor(
      request.auth,
      request.validated.params.taskId,
      request.validated.body.color,
    );
    response.json({ data: result });
  },

  deleteKanbanColor: async (request, response) => {
    const result = await service.deleteKanbanColor(
      request.auth,
      request.validated.params.taskId,
    );
    response.json({ data: result });
  },
});
