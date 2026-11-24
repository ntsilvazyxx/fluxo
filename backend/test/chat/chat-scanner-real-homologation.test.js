import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  CHAT_ATTACHMENT_SCAN_RESULTS,
  createClamAvChatAttachmentScanner,
} from '../../src/modules/chat/chat-attachment-scanner.js';

describe('FASE 5.1.7 — Homologação Real do Scanner ClamAV 1.5.5', () => {
  const realScanner = createClamAvChatAttachmentScanner();

  it('1. Scanner real está disponível e responde com sucesso (ClamAV 1.5.5)', async () => {
    const isAvailable = await realScanner.isAvailable();
    assert.equal(isAvailable, true, 'O executável clamscan real deve estar disponível e funcional');
  });

  it('2. Scanner real aprova arquivo de texto benigno como CLEAN', async () => {
    const tempFile = path.join(tmpdir(), `seaf-benign-test-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, 'Documento de teste oficial benigno para homologação do SEAF.');

    try {
      const scanResult = await realScanner.scanFile(tempFile);
      assert.equal(scanResult.result, CHAT_ATTACHMENT_SCAN_RESULTS.CLEAN);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  it('3. Scanner real aprova documento PDF benigno sintético como CLEAN', async () => {
    const tempFile = path.join(tmpdir(), `seaf-benign-test-${Date.now()}.pdf`);
    // Minimal valid PDF structure
    const pdfContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n118\n%%EOF\n';
    fs.writeFileSync(tempFile, pdfContent);

    try {
      const scanResult = await realScanner.scanFile(tempFile);
      assert.equal(scanResult.result, CHAT_ATTACHMENT_SCAN_RESULTS.CLEAN);
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  it('4. Fail-closed: comando inexistente resulta em indisponibilidade imediata (isAvailable=false e erro 503)', async () => {
    const brokenScanner = createClamAvChatAttachmentScanner({
      command: 'C:\\caminho\\inexistente\\clamscan_fake.exe',
    });
    const available = await brokenScanner.isAvailable();
    assert.equal(available, false);

    await assert.rejects(
      () => brokenScanner.scanFile(path.join(tmpdir(), 'arquivo_qualquer.txt')),
      (err) => err.code === 'CHAT_ATTACHMENT_SCANNER_UNAVAILABLE',
    );
  });

  it('5. Fail-closed: base de assinaturas inexistente ou corrompida rejeita upload com CHAT_ATTACHMENT_SCANNER_UNAVAILABLE', async () => {
    const brokenDbScanner = createClamAvChatAttachmentScanner({
      databasePath: 'C:\\caminho\\inexistente\\db',
    });
    const tempFile = path.join(tmpdir(), `seaf-db-test-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, 'conteudo');

    try {
      await assert.rejects(
        () => brokenDbScanner.scanFile(tempFile),
        (err) => err.code === 'CHAT_ATTACHMENT_SCANNER_UNAVAILABLE',
      );
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });
});
