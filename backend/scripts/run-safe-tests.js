import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['--test'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    RUN_CHAT_REAL_HOMOLOGATION: '0',
    CHAT_HOMOLOGATION_DATABASE_URL: '',
  },
});

child.on('error', (error) => {
  console.error('Falha ao iniciar os testes seguros.', error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
