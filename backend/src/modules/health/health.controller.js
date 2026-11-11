const startedAt = new Date().toISOString();

export const getHealth = (_request, response) => {
  response.status(200).json({
    data: {
      status: 'ok',
      service: 'seaf-api',
      version: '0.1.0',
      startedAt,
      uptimeSeconds: Math.floor(process.uptime()),
    },
  });
};
