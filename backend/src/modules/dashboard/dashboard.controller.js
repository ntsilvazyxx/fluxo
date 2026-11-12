export const createDashboardController = ({ service }) => ({
  summary: async (request, response) => {
    const data = await service.summary(request.auth, request.validated.query);
    response.json({ data });
  },
  report: async (request, response) => {
    const data = await service.report(request.auth, request.validated.query);
    response.json({ data });
  },
});
