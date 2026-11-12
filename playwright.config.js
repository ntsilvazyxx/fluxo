import { defineConfig } from '@playwright/test';
import { testDatabase } from './quality/test-database.js';
import { randomBytes } from 'node:crypto';
process.env.AUTH_DATA_ENCRYPTION_KEY ||= randomBytes(32).toString('hex');
const { url, prisma } = testDatabase();
await prisma.$disconnect();
export default defineConfig({
  testDir: './quality/e2e', workers: 1, fullyParallel: false, retries: 0,
  timeout: 60_000, expect: { timeout: 10_000 }, forbidOnly: true,
  outputDir: '.artifacts/e2e', reporter: [['list'], ['json', { outputFile: '.artifacts/e2e-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4179', viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', actionTimeout: 10_000, navigationTimeout: 15_000, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    { command: 'node quality/server.js', url: 'http://127.0.0.1:3109/api/v1/health', reuseExistingServer: false,
      env: { DATABASE_URL: url, MAIL_ENABLED: '0' } },
    { command: 'npm run dev --workspace frontend -- --host 127.0.0.1 --port 4179 --strictPort', url: 'http://127.0.0.1:4179', reuseExistingServer: false,
      env: { VITE_API_URL: 'http://127.0.0.1:3109/api/v1' } },
  ],
});
