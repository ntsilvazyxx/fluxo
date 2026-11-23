import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { getChatHomologationDatabaseUrl } from '../testing/chat-homologation-guard.js';

const rootEnv = path.resolve(import.meta.dirname, '../../.env.homologation.local');
const localEnv = path.resolve(import.meta.dirname, '../.env.homologation.local');
if (existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
} else if (existsSync(localEnv)) {
  dotenv.config({ path: localEnv });
}

try {
  getChatHomologationDatabaseUrl();
} catch (error) {
  console.error(`Homologação real recusada: ${error.message}`);
  process.exit(1);
}

const child = spawn(process.execPath, [
  '--test',
  '--test-concurrency=1',
  'test/chat/chat-real-homologation.test.js',
  'test/chat/chat-staging-real-homologation.test.js',
], {
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (error) => {
  console.error('Falha ao iniciar a homologação real do Chat.', error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
