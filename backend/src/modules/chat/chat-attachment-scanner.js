import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

export const CHAT_ATTACHMENT_SCAN_RESULTS = Object.freeze({ CLEAN: 'CLEAN', INFECTED: 'INFECTED' });

export function assertChatAttachmentScanner(scanner) {
  if (typeof scanner?.isAvailable !== 'function' || typeof scanner?.scanFile !== 'function') {
    throw new TypeError('Scanner de anexos do Chat inválido.');
  }
  return scanner;
}

const resolveDefaultCommand = () => {
  if (process.env.CLAMSCAN_PATH) return process.env.CLAMSCAN_PATH;
  if (process.platform === 'win32') {
    const standardPath = 'C:\\Program Files\\ClamAV\\clamscan.exe';
    if (existsSync(standardPath)) return standardPath;
  }
  return 'clamscan';
};

const resolveDefaultDatabase = () => {
  if (process.env.CLAMAV_DB_PATH) return process.env.CLAMAV_DB_PATH;
  if (process.platform === 'win32') {
    const standardDb = 'C:\\ProgramData\\ClamAV\\db';
    if (existsSync(standardDb)) return standardDb;
  }
  return undefined;
};

export function createClamAvChatAttachmentScanner({
  command = resolveDefaultCommand(),
  databasePath = resolveDefaultDatabase(),
  spawnProcess = spawn,
} = {}) {
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
      const args = ['--no-summary', '--infected'];
      if (databasePath) {
        args.push(`--database=${databasePath}`);
      }
      args.push(filePath);
      const result = await run(args);
      if (!result.available || ![0, 1].includes(result.code)) {
        const error = new Error('Scanner de anexos indisponível.');
        error.code = 'CHAT_ATTACHMENT_SCANNER_UNAVAILABLE';
        throw error;
      }
      return { result: result.code === 0 ? CHAT_ATTACHMENT_SCAN_RESULTS.CLEAN : CHAT_ATTACHMENT_SCAN_RESULTS.INFECTED };
    },
  });
}
