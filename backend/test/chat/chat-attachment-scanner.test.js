import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import {
  CHAT_ATTACHMENT_SCAN_RESULTS,
  assertChatAttachmentScanner,
  createClamAvChatAttachmentScanner,
} from '../../src/modules/chat/chat-attachment-scanner.js';

describe('Interface e Implementação do Scanner de Anexos (Fase 5.1.2)', () => {
  it('assertChatAttachmentScanner valida a interface obrigatória', () => {
    assert.throws(() => assertChatAttachmentScanner(null), TypeError);
    assert.throws(() => assertChatAttachmentScanner({}), TypeError);
    assert.throws(() => assertChatAttachmentScanner({ isAvailable: () => true }), TypeError);

    const valid = { isAvailable: async () => true, scanFile: async () => ({ result: 'CLEAN' }) };
    assert.equal(assertChatAttachmentScanner(valid), valid);
  });

  it('funciona em modo fail-closed quando o executável do antivírus não existe', async () => {
    const scanner = createClamAvChatAttachmentScanner({ command: 'executavel_inexistente_antivirus_seaf' });
    const available = await scanner.isAvailable();
    assert.equal(available, false, 'O scanner deve reportar indisponibilidade quando o binário não existe');

    await assert.rejects(
      () => scanner.scanFile('/tmp/teste.pdf'),
      (err) => err.code === 'CHAT_ATTACHMENT_SCANNER_UNAVAILABLE',
    );
  });

  it('retorna CLEAN quando o processo do antivírus sai com código 0', async () => {
    const mockSpawn = (_cmd, _args) => {
      const emitter = new EventEmitter();
      process.nextTick(() => {
        emitter.emit('exit', 0);
      });
      return emitter;
    };

    const scanner = createClamAvChatAttachmentScanner({ spawnProcess: mockSpawn });
    assert.equal(await scanner.isAvailable(), true);

    const scan = await scanner.scanFile('/caminho/arquivo_limpo.pdf');
    assert.equal(scan.result, CHAT_ATTACHMENT_SCAN_RESULTS.CLEAN);
  });

  it('retorna INFECTED quando o processo do antivírus detecta malware (código 1)', async () => {
    const mockSpawn = (_cmd, args) => {
      const emitter = new EventEmitter();
      process.nextTick(() => {
        if (args.includes('--version')) {
          emitter.emit('exit', 0);
        } else {
          emitter.emit('exit', 1); // 1 = infected no clamscan
        }
      });
      return emitter;
    };

    const scanner = createClamAvChatAttachmentScanner({ spawnProcess: mockSpawn });
    assert.equal(await scanner.isAvailable(), true);

    const scan = await scanner.scanFile('/caminho/eicar.com.txt');
    assert.equal(scan.result, CHAT_ATTACHMENT_SCAN_RESULTS.INFECTED);
  });

  it('lança CHAT_ATTACHMENT_SCANNER_UNAVAILABLE em erro inesperado de execução', async () => {
    const mockSpawn = () => {
      const emitter = new EventEmitter();
      process.nextTick(() => {
        emitter.emit('error', new Error('Falha de I/O no daemon'));
      });
      return emitter;
    };

    const scanner = createClamAvChatAttachmentScanner({ spawnProcess: mockSpawn });
    await assert.rejects(
      () => scanner.scanFile('/caminho/arquivo.pdf'),
      (err) => err.code === 'CHAT_ATTACHMENT_SCANNER_UNAVAILABLE',
    );
  });
});
