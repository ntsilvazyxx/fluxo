import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { fileTypeFromFile } from 'file-type';
import { AppError } from '../../shared/errors/app-error.js';

export const CHAT_ATTACHMENT_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const CHAT_ATTACHMENT_MAX_FILES_PER_MESSAGE = 5;
export const CHAT_ATTACHMENT_MAX_MESSAGE_BYTES = 50 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 2048;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;

const allowed = new Map([
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp'],
  ['.pdf', 'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.txt', 'text/plain'],
]);

const fail = (code, message, status = 422) => { throw new AppError(status, code, message); };

export function sanitizeChatAttachmentName(value) {
  const base = path.basename(String(value ?? '')).normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_').replace(/[. ]+$/g, '').trim();
  if (!base || base === '.' || base === '..') fail('CHAT_ATTACHMENT_INVALID_NAME', 'Nome de arquivo inválido.', 400);
  return [...base].slice(0, 255).join('');
}

const hashFile = (filePath) => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.once('error', reject);
  stream.once('end', () => resolve(hash.digest('hex')));
});

const inspectPdf = async (filePath) => {
  const handle = await open(filePath, 'r');
  try {
    const info = await handle.stat();
    const head = Buffer.alloc(Math.min(info.size, 8));
    const tail = Buffer.alloc(Math.min(info.size, 4096));
    await handle.read(head, 0, head.length, 0);
    await handle.read(tail, 0, tail.length, info.size - tail.length);
    if (!head.subarray(0, 5).equals(Buffer.from('%PDF-')) || !tail.includes(Buffer.from('%%EOF'))) {
      fail('CHAT_ATTACHMENT_MALFORMED_PDF', 'Arquivo PDF malformado.');
    }
    const stream = createReadStream(filePath, { encoding: 'latin1' });
    let carry = '';
    for await (const chunk of stream) {
      carry = (carry + chunk).slice(-8192);
      if (/\/(Encrypt|JavaScript|JS|Launch|EmbeddedFile|XFA|RichMedia)\b/i.test(carry)) {
        fail('CHAT_ATTACHMENT_ACTIVE_CONTENT', 'PDF protegido ou com conteúdo ativo não permitido.');
      }
    }
  } finally { await handle.close(); }
};

const readZipDirectory = async (filePath) => {
  const handle = await open(filePath, 'r');
  try {
    const info = await handle.stat();
    const tailSize = Math.min(info.size, 65_557);
    const tail = Buffer.alloc(tailSize);
    await handle.read(tail, 0, tailSize, info.size - tailSize);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) fail('CHAT_ATTACHMENT_MALFORMED_ZIP', 'Pacote Office malformado.');
    const count = tail.readUInt16LE(eocd + 10);
    const directorySize = tail.readUInt32LE(eocd + 12);
    const directoryOffset = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff || count > MAX_ZIP_ENTRIES) {
      fail('CHAT_ATTACHMENT_ZIP_LIMIT', 'Pacote Office excede os limites de inspeção.');
    }
    const entries = [];
    let offset = directoryOffset;
    let compressedTotal = 0;
    let uncompressedTotal = 0;
    for (let index = 0; index < count; index += 1) {
      const fixed = Buffer.alloc(46);
      const { bytesRead } = await handle.read(fixed, 0, fixed.length, offset);
      if (bytesRead !== 46 || fixed.readUInt32LE(0) !== 0x02014b50) fail('CHAT_ATTACHMENT_MALFORMED_ZIP', 'Diretório ZIP inválido.');
      const flags = fixed.readUInt16LE(8);
      const compressed = fixed.readUInt32LE(20);
      const uncompressed = fixed.readUInt32LE(24);
      const nameLength = fixed.readUInt16LE(28);
      const extraLength = fixed.readUInt16LE(30);
      const commentLength = fixed.readUInt16LE(32);
      if ((flags & 1) !== 0 || compressed === 0xffffffff || uncompressed === 0xffffffff || nameLength > 1024) {
        fail('CHAT_ATTACHMENT_ENCRYPTED_OR_UNSUPPORTED', 'Pacote protegido ou não inspecionável.');
      }
      const nameBuffer = Buffer.alloc(nameLength);
      await handle.read(nameBuffer, 0, nameLength, offset + 46);
      const name = nameBuffer.toString('utf8');
      if (!name || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..')) fail('CHAT_ATTACHMENT_UNSAFE_ZIP_PATH', 'Pacote contém caminho inseguro.');
      entries.push(name);
      compressedTotal += compressed;
      uncompressedTotal += uncompressed;
      offset += 46 + nameLength + extraLength + commentLength;
    }
    if (offset - directoryOffset !== directorySize || uncompressedTotal > MAX_UNCOMPRESSED_BYTES
      || (uncompressedTotal > 0 && compressedTotal === 0)
      || (compressedTotal > 0 && uncompressedTotal / compressedTotal > MAX_COMPRESSION_RATIO)) {
      fail('CHAT_ATTACHMENT_ZIP_BOMB', 'Pacote compactado excede limites seguros.');
    }
    if (entries.some((name) => /(^|\/)(vbaProject\.bin|activeX|embeddings|externalLinks)(\/|$)/i.test(name))) {
      fail('CHAT_ATTACHMENT_ACTIVE_CONTENT', 'Conteúdo ativo ou incorporado não permitido.');
    }
    return new Set(entries);
  } finally { await handle.close(); }
};

const inspectOffice = async (filePath, extension) => {
  const entries = await readZipDirectory(filePath);
  const required = extension === '.docx'
    ? ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']
    : ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml'];
  if (!required.every((entry) => entries.has(entry))) fail('CHAT_ATTACHMENT_OFFICE_STRUCTURE', 'Estrutura do documento Office inválida.');
};

const inspectUtf8 = async (filePath) => {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for await (const chunk of createReadStream(filePath)) decoder.decode(chunk, { stream: true });
    decoder.decode();
  } catch { fail('CHAT_ATTACHMENT_INVALID_UTF8', 'O arquivo TXT deve conter UTF-8 válido.'); }
};

export async function inspectChatAttachment(file, { maxBytes = CHAT_ATTACHMENT_MAX_FILE_BYTES } = {}) {
  if (!file?.path) fail('CHAT_ATTACHMENT_REQUIRED', 'Arquivo obrigatório.', 400);
  const info = await stat(file.path);
  if (!info.isFile() || info.size === 0) fail('CHAT_ATTACHMENT_EMPTY', 'Arquivo vazio não é permitido.');
  if (info.size > maxBytes) fail('CHAT_ATTACHMENT_TOO_LARGE', 'O arquivo excede 20 MB.', 413);
  const originalName = sanitizeChatAttachmentName(file.originalname);
  const extension = path.extname(originalName).toLowerCase();
  const mimeType = allowed.get(extension);
  if (!mimeType) fail('CHAT_ATTACHMENT_EXTENSION_NOT_ALLOWED', 'Formato de arquivo não permitido.');
  const detected = await fileTypeFromFile(file.path);
  if (extension === '.txt') {
    if (detected) fail('CHAT_ATTACHMENT_CONTENT_MISMATCH', 'A extensão não corresponde ao conteúdo real.');
    await inspectUtf8(file.path);
  } else if (extension === '.docx' || extension === '.xlsx') {
    if (detected && detected.mime !== mimeType && detected.mime !== 'application/zip') fail('CHAT_ATTACHMENT_CONTENT_MISMATCH', 'A extensão não corresponde ao conteúdo real.');
    await inspectOffice(file.path, extension);
  } else {
    if (detected?.mime !== mimeType) fail('CHAT_ATTACHMENT_CONTENT_MISMATCH', 'A extensão não corresponde ao conteúdo real.');
    if (extension === '.pdf') await inspectPdf(file.path);
  }
  return { originalName, extension, mimeType, sizeBytes: info.size, sha256: await hashFile(file.path) };
}
