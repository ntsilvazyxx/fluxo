import { describe, expect, it } from 'vitest';
import {
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  CHAT_ATTACHMENT_MAX_FILES_PER_MESSAGE,
  CHAT_ATTACHMENT_MAX_MESSAGE_BYTES,
} from './chat-attachment.constants.ts';
import type { LocalAttachment } from './chat-attachment.types.ts';
import {
  getFileExtension,
  sanitizeAttachmentName,
  validateBatchSelection,
  validateSingleFile,
} from './chat-attachment.validation.ts';

describe('FASE 5.1.7.3 — chat-attachment.validation (Validações de Anexos no Frontend)', () => {
  describe('sanitizeAttachmentName', () => {
    it('1. Sanitiza caracteres perigosos, path traversal e caracteres de controle', () => {
      expect(sanitizeAttachmentName('../../etc/passwd')).toBe('.._.._etc_passwd');
      expect(sanitizeAttachmentName('documento\u0000\u001f.pdf')).toBe('documento__.pdf');
      expect(sanitizeAttachmentName('relatório:anual?.docx')).toBe('relatório_anual_.docx');
      expect(sanitizeAttachmentName('arquivo<teste>|*.png')).toBe('arquivo_teste___.png');
    });

    it('2. Trunca nomes acima de 255 caracteres e remove pontos ou espaços finais', () => {
      const longName = `${'a'.repeat(300)}.pdf`;
      const sanitized = sanitizeAttachmentName(longName);
      expect(sanitized.length).toBeLessThanOrEqual(255);

      expect(sanitizeAttachmentName('arquivo.pdf...   ')).toBe('arquivo.pdf');
      expect(sanitizeAttachmentName('')).toBe('anexo');
    });
  });

  describe('getFileExtension', () => {
    it('3. Extrai extensão minúscula ou retorna vazio', () => {
      expect(getFileExtension('relatorio.PDF')).toBe('.pdf');
      expect(getFileExtension('imagem.JPEG')).toBe('.jpeg');
      expect(getFileExtension('arquivo_sem_extensao')).toBe('');
      expect(getFileExtension('.gitignore')).toBe('');
    });
  });

  describe('validateSingleFile', () => {
    it('4. Rejeita arquivo nulo ou vazio (0 bytes)', () => {
      const emptyFile = new File([''], 'vazio.txt', { type: 'text/plain' });
      const res = validateSingleFile(emptyFile);
      expect(res.valid).toBe(false);
      expect(res.errorCode).toBe('CHAT_ATTACHMENT_EMPTY');
    });

    it('5. Rejeita arquivo que excede 20 MiB individual', () => {
      const bigFile = new File([new ArrayBuffer(100)], 'grande.pdf', { type: 'application/pdf' });
      Object.defineProperty(bigFile, 'size', { value: CHAT_ATTACHMENT_MAX_FILE_BYTES + 1 });

      const res = validateSingleFile(bigFile);
      expect(res.valid).toBe(false);
      expect(res.errorCode).toBe('CHAT_ATTACHMENT_TOO_LARGE');
    });

    it('6. Rejeita extensões fora da whitelist (.exe, .sh, .zip, etc.)', () => {
      const exeFile = new File(['conteudo'], 'virus.exe', { type: 'application/x-msdownload' });
      const res = validateSingleFile(exeFile);
      expect(res.valid).toBe(false);
      expect(res.errorCode).toBe('CHAT_ATTACHMENT_EXTENSION_NOT_ALLOWED');
    });

    it('7. Aceita todas as extensões permitidas (.jpg, .jpeg, .png, .webp, .pdf, .docx, .xlsx, .txt)', () => {
      const validNames = [
        'foto.jpg',
        'foto.jpeg',
        'foto.png',
        'foto.webp',
        'laudo.pdf',
        'oficio.docx',
        'planilha.xlsx',
        'notas.txt',
      ];

      for (const name of validNames) {
        const file = new File(['dados'], name);
        const res = validateSingleFile(file);
        expect(res.valid).toBe(true);
      }
    });
  });

  describe('validateBatchSelection', () => {
    const makeAttachment = (name: string, size: number, localId: string): LocalAttachment => ({
      localId,
      clientUploadId: `client-${localId}`,
      originalName: name,
      sizeBytes: size,
      localStatus: 'READY',
      file: new File(['x'], name, { lastModified: 1000 }),
    });

    it('8. Rejeita duplicatas exatas de arquivo já presente na fila', () => {
      const currentQueue = [makeAttachment('relatorio.pdf', 1024, '1')];
      const newFile = new File(['x'], 'relatorio.pdf');
      Object.defineProperty(newFile, 'size', { value: 1024 });
      Object.defineProperty(newFile, 'lastModified', { value: 1000 });

      const result = validateBatchSelection([newFile], currentQueue);
      expect(result.accepted).toHaveLength(0);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].errorCode).toBe('CHAT_ATTACHMENT_DUPLICATE_IN_QUEUE');
    });

    it('9. Rejeita arquivos que excedem o limite de 5 anexos por mensagem', () => {
      const currentQueue = [
        makeAttachment('f1.pdf', 100, '1'),
        makeAttachment('f2.pdf', 100, '2'),
        makeAttachment('f3.pdf', 100, '3'),
        makeAttachment('f4.pdf', 100, '4'),
        makeAttachment('f5.pdf', 100, '5'),
      ];

      const newFile = new File(['dados'], 'f6.pdf');
      const result = validateBatchSelection([newFile], currentQueue);
      expect(result.accepted).toHaveLength(0);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].errorCode).toBe('CHAT_ATTACHMENT_LIMIT_EXCEEDED');
    });

    it('10. Rejeita arquivos que ultrapassam a quota agregada de 50 MiB por mensagem', () => {
      const currentQueue = [
        makeAttachment('f1.pdf', 45 * 1024 * 1024, '1'),
      ];

      const newFile = new File(['dados'], 'f2.pdf');
      Object.defineProperty(newFile, 'size', { value: 10 * 1024 * 1024 }); // 45 + 10 = 55 MB > 50 MB

      const result = validateBatchSelection([newFile], currentQueue);
      expect(result.accepted).toHaveLength(0);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].errorCode).toBe('CHAT_ATTACHMENT_MESSAGE_TOO_LARGE');
    });

    it('11. Aceita arquivos válidos até o limite máximo de 5 arquivos e 50 MiB', () => {
      const file1 = new File(['dados1'], 'doc1.pdf');
      const file2 = new File(['dados2'], 'foto.png');

      const result = validateBatchSelection([file1, file2], []);
      expect(result.accepted).toHaveLength(2);
      expect(result.rejected).toHaveLength(0);
      expect(result.accepted[0].originalName).toBe('doc1.pdf');
      expect(result.accepted[1].originalName).toBe('foto.png');
      expect(result.accepted[0].localStatus).toBe('SELECTED');
    });
  });
});
