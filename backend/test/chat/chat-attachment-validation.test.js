import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  inspectChatAttachment,
  sanitizeChatAttachmentName,
} from '../../src/modules/chat/chat-attachment.validation.js';

describe('Validação Segura de Anexos do Chat — Fase 5.1.2', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'seaf-chat-val-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('Sanitização de Nome de Arquivo (sanitizeChatAttachmentName)', () => {
    it('mantém nomes seguros e remove caracteres proibidos', () => {
      assert.equal(sanitizeChatAttachmentName('relatorio_final.pdf'), 'relatorio_final.pdf');
      assert.equal(sanitizeChatAttachmentName('relatorio:teste*1?.pdf'), 'relatorio_teste_1_.pdf');
      assert.equal(sanitizeChatAttachmentName('   espacos   .txt   '), 'espacos   .txt');
    });

    it('bloqueia nomes inválidos ou vazios', () => {
      assert.throws(() => sanitizeChatAttachmentName(''), { code: 'CHAT_ATTACHMENT_INVALID_NAME' });
      assert.throws(() => sanitizeChatAttachmentName('.'), { code: 'CHAT_ATTACHMENT_INVALID_NAME' });
      assert.throws(() => sanitizeChatAttachmentName('..'), { code: 'CHAT_ATTACHMENT_INVALID_NAME' });
      assert.throws(() => sanitizeChatAttachmentName('   '), { code: 'CHAT_ATTACHMENT_INVALID_NAME' });
    });

    it('trunca nomes com mais de 255 caracteres', () => {
      const longName = `${'a'.repeat(300)}.pdf`;
      const sanitized = sanitizeChatAttachmentName(longName);
      assert.ok(sanitized.length <= 255);
    });
  });

  describe('Validação de Formatos, Limites e Conteúdo', () => {
    it('rejeita arquivo inexistente ou vazio', async () => {
      await assert.rejects(
        () => inspectChatAttachment(null),
        (err) => err.code === 'CHAT_ATTACHMENT_REQUIRED',
      );

      const emptyFile = path.join(tmpDir, 'vazio.txt');
      await writeFile(emptyFile, Buffer.alloc(0));
      await assert.rejects(
        () => inspectChatAttachment({ path: emptyFile, originalname: 'vazio.txt' }),
        (err) => err.code === 'CHAT_ATTACHMENT_EMPTY',
      );
    });

    it('rejeita arquivo que excede o limite máximo configurado (20 MB)', async () => {
      const file = path.join(tmpDir, 'grande.txt');
      await writeFile(file, Buffer.from('conteudo'));
      await assert.rejects(
        () => inspectChatAttachment({ path: file, originalname: 'grande.txt' }, { maxBytes: 5 }),
        (err) => err.code === 'CHAT_ATTACHMENT_TOO_LARGE',
      );
    });

    it('rejeita extensões não autorizadas (.exe, .sh, .zip direto, .html)', async () => {
      const forbidden = ['script.exe', 'teste.sh', 'arquivo.zip', 'pagina.html', 'codigo.js'];
      for (const name of forbidden) {
        const file = path.join(tmpDir, name);
        await writeFile(file, Buffer.from('conteudo'));
        await assert.rejects(
          () => inspectChatAttachment({ path: file, originalname: name }),
          (err) => err.code === 'CHAT_ATTACHMENT_EXTENSION_NOT_ALLOWED',
        );
      }
    });

    it('aceita arquivo TXT com codificação UTF-8 válida', async () => {
      const txtFile = path.join(tmpDir, 'documento.txt');
      await writeFile(txtFile, Buffer.from('Secretaria de Estado de Agricultura Familiar — SEAF-MT', 'utf8'));

      const result = await inspectChatAttachment({ path: txtFile, originalname: 'documento.txt' });
      assert.equal(result.originalName, 'documento.txt');
      assert.equal(result.extension, '.txt');
      assert.equal(result.mimeType, 'text/plain');
      assert.ok(result.sha256 && result.sha256.length === 64);
      assert.ok(result.sizeBytes > 0);
    });

    it('rejeita arquivo TXT com sequência de bytes UTF-8 inválida', async () => {
      const badTxt = path.join(tmpDir, 'corrompido.txt');
      // Sequência inválida de continuação UTF-8 isolada (0x80)
      await writeFile(badTxt, Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x80, 0x57, 0x6f, 0x72, 0x6c, 0x64]));

      await assert.rejects(
        () => inspectChatAttachment({ path: badTxt, originalname: 'corrompido.txt' }),
        (err) => err.code === 'CHAT_ATTACHMENT_INVALID_UTF8',
      );
    });

    it('rejeita conteúdo binário com extensão .txt (content mismatch ou UTF-8 inválido)', async () => {
      const fakeTxt = path.join(tmpDir, 'imagem_falsa.txt');
      // Cabeçalho de imagem PNG
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00]);
      await writeFile(fakeTxt, pngHeader);

      await assert.rejects(
        () => inspectChatAttachment({ path: fakeTxt, originalname: 'imagem_falsa.txt' }),
        (err) => err.code === 'CHAT_ATTACHMENT_CONTENT_MISMATCH' || err.code === 'CHAT_ATTACHMENT_INVALID_UTF8',
      );
    });

    it('aceita arquivo PDF estruturado e sem conteúdo ativo', async () => {
      const pdfFile = path.join(tmpDir, 'valido.pdf');
      const validPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
        '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n' +
        'xref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n' +
        'trailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n115\n%%EOF',
      );
      await writeFile(pdfFile, validPdf);

      const result = await inspectChatAttachment({ path: pdfFile, originalname: 'valido.pdf' });
      assert.equal(result.extension, '.pdf');
      assert.equal(result.mimeType, 'application/pdf');
    });

    it('rejeita PDF sem cabeçalho %PDF- ou sem marcador %%EOF', async () => {
      const badHeader = path.join(tmpDir, 'sem_cabecalho.pdf');
      await writeFile(badHeader, Buffer.from('NOT_A_PDF_CONTENT\n%%EOF'));

      await assert.rejects(
        () => inspectChatAttachment({ path: badHeader, originalname: 'sem_cabecalho.pdf' }),
        (err) => err.code === 'CHAT_ATTACHMENT_CONTENT_MISMATCH' || err.code === 'CHAT_ATTACHMENT_MALFORMED_PDF',
      );
    });

    it('rejeita PDF com conteúdo ativo proibido (/JavaScript)', async () => {
      const activePdf = path.join(tmpDir, 'ativo.pdf');
      const pdfWithJs = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Action /S /JavaScript /JS (app.alert("hack")) >>\nendobj\n' +
        'trailer\n<< >>\n%%EOF',
      );
      await writeFile(activePdf, pdfWithJs);

      await assert.rejects(
        () => inspectChatAttachment({ path: activePdf, originalname: 'ativo.pdf' }),
        (err) => err.code === 'CHAT_ATTACHMENT_ACTIVE_CONTENT',
      );
    });

    it('rejeita PDF com comando de execução /Launch', async () => {
      const launchPdf = path.join(tmpDir, 'launch.pdf');
      const pdfWithLaunch = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Action /S /Launch /F (calc.exe) >>\nendobj\n' +
        'trailer\n<< >>\n%%EOF',
      );
      await writeFile(launchPdf, pdfWithLaunch);

      await assert.rejects(
        () => inspectChatAttachment({ path: launchPdf, originalname: 'launch.pdf' }),
        (err) => err.code === 'CHAT_ATTACHMENT_ACTIVE_CONTENT',
      );
    });

    it('aceita imagem PNG autêntica', async () => {
      const pngFile = path.join(tmpDir, 'foto.png');
      // Buffer mínimo de PNG válido
      const validPng = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk length and type
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 pixels
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
        0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, // IDAT
        0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4,
        0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND
        0xae, 0x42, 0x60, 0x82,
      ]);
      await writeFile(pngFile, validPng);

      const result = await inspectChatAttachment({ path: pngFile, originalname: 'foto.png' });
      assert.equal(result.extension, '.png');
      assert.equal(result.mimeType, 'image/png');
    });

    it('rejeita imagem com extensão trocada (content mismatch)', async () => {
      const fakeJpg = path.join(tmpDir, 'foto.jpg');
      // Conteúdo texto puro mas com extensão .jpg
      await writeFile(fakeJpg, Buffer.from('isto não é uma imagem jpeg'));

      await assert.rejects(
        () => inspectChatAttachment({ path: fakeJpg, originalname: 'foto.jpg' }),
        (err) => err.code === 'CHAT_ATTACHMENT_CONTENT_MISMATCH',
      );
    });
  });
});
