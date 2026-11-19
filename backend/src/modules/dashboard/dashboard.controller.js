export const createDashboardController = ({ service }) => ({
  summary: async (request, response) => {
    const data = await service.summary(request.auth, request.validated.query);
    response.json({ data });
  },
  report: async (request, response) => {
    const data = await service.report(request.auth, request.validated.query);
    response.json({ data });
  },
  exportCsv: async (request, response) => {
    const { filename, csv } = await service.exportCsv(request.auth, request.validated.query);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.send(csv);
  },
});
