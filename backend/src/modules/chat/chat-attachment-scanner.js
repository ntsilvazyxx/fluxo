import { spawn } from 'node:child_process';

export const CHAT_ATTACHMENT_SCAN_RESULTS = Object.freeze({ CLEAN: 'CLEAN', INFECTED: 'INFECTED' });

export function assertChatAttachmentScanner(scanner) {
  if (typeof scanner?.isAvailable !== 'function' || typeof scanner?.scanFile !== 'function') {
    throw new TypeError('Scanner de anexos do Chat inválido.');
  }
  return scanner;
}

export function createClamAvChatAttachmentScanner({ command = 'clamscan', spawnProcess = spawn } = {}) {
  const run = (args) => new Promise((resolve) => {
    const child = spawnProcess(command, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
    child.once('error', (error) => resolve({ available: false, error }));
    child.once('exit', (code) => resolve({ available: true, code }));
  });

  return assertChatAttachmentScanner({
    async isAvailable() {
      const result = await run(['--version']);
      return result.available && result.code === 0;
    },
    async scanFile(filePath) {
      const result = await run(['--no-summary', '--infected', filePath]);
      if (!result.available || ![0, 1].includes(result.code)) {
        const error = new Error('Scanner de anexos indisponível.');
        error.code = 'CHAT_ATTACHMENT_SCANNER_UNAVAILABLE';
        throw error;
      }
      return { result: result.code === 0 ? CHAT_ATTACHMENT_SCAN_RESULTS.CLEAN : CHAT_ATTACHMENT_SCAN_RESULTS.INFECTED };
    },
  });
}
