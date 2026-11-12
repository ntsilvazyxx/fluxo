export function validateProductionConfig(config) {
  if (config.nodeEnv !== 'production') return;
  if (Buffer.byteLength(config.jwtAccessSecret ?? '', 'utf8') < 32 || config.jwtAccessSecret.includes('gere_uma_chave')) {
    throw new Error('Produção exige JWT_ACCESS_SECRET aleatório com pelo menos 32 bytes.');
  }
  if (!config.cookieSecure) throw new Error('Produção exige COOKIE_SECURE=1 e HTTPS.');
  for (const url of [...config.corsOrigins, config.appBaseUrl]) {
    if (new URL(url).protocol !== 'https:') throw new Error('Produção exige URLs HTTPS explícitas no CORS e APP_BASE_URL.');
  }
  if (!config.corsOrigins.length) throw new Error('Produção exige CORS_ORIGINS explícito.');
  if (!/^[a-f0-9]{64}$/i.test(config.authDataEncryptionKey ?? '')) throw new Error('Produção exige AUTH_DATA_ENCRYPTION_KEY com 32 bytes em hexadecimal.');
  if (config.mailEnabled && (!config.mailHost || Boolean(config.mailUser) !== Boolean(config.mailPass))) throw new Error('Configuração SMTP incompleta.');
}
