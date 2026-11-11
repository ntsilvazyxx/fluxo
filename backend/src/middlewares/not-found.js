export const notFound = (request, response) => {
  response.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: 'Rota não encontrada.',
      details: {
        method: request.method,
        path: request.originalUrl,
      },
    },
  });
};
