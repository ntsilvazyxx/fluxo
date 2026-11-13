import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromFile } from 'file-type';
import { AppError } from '../../shared/errors/app-error.js';

const allowed = new Map([['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp'], ['.pdf', 'application/pdf'], ['.doc', 'application/msword'], ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']]);
const readPrefix = async (filePath, size = 8) => { const handle = await open(filePath, 'r'); try { const buffer = Buffer.alloc(size); await handle.read(buffer, 0, size, 0); return buffer; } finally { await handle.close(); } };
const sha256 = async (filePath) => { const handle = await open(filePath, 'r'); const hash = createHash('sha256'); try { const buffer = Buffer.alloc(1024 * 1024); let position = 0; for (;;) { const { bytesRead } = await handle.read(buffer, 0, buffer.length, position); if (!bytesRead) break; hash.update(buffer.subarray(0, bytesRead)); position += bytesRead; } return hash.digest('hex'); } finally { await handle.close(); } };
const MAX_ZIP_ENTRIES = 10000;
const MAX_ZIP_COMPRESSED_RATIO = 1000;
const DOCX_REQUIRED_PARTS = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'];
const PDF_HEADER = Buffer.from('%PDF-');
const ACTIVE_CONTENT_PATTERNS = [/JavaScript/, /Launch/, /EmbeddedFile/, /Actions/, /AcroForm/, /XFA/];

const zipCentralDirectory = async (handle) => {
  const stat = await handle.stat();
  const size = stat.size;
  const scanSize = Math.min(size, 65536);
  const buffer = Buffer.alloc(scanSize);
  await handle.read(buffer, 0, scanSize, size - scanSize);
  const signature = Buffer.from('PK\x05\x06');
  let offset = -1;
  for (let i = scanSize - signature.length; i >= 0; i--) {
    if (buffer.subarray(i, i + signature.length).equals(signature)) { offset = size - scanSize + i; break; }
  }
  if (offset < 0) throw new AppError(422, 'ATTACHMENT_INVALID_ZIP', 'Estrutura do pacote ZIP inválida.');
  const cdBuffer = Buffer.alloc(22);
  await handle.read(cdBuffer, 0, 22, offset);
  const totalEntries = cdBuffer.readUInt16LE(10);
  const centralSize = cdBuffer.readUInt32LE(12);
  const centralOffset = cdBuffer.readUInt32LE(16);
  return { totalEntries, centralSize, centralOffset, endOfCentralOffset: offset };
};

const enumerateZipEntries = async (handle, eocd) => {
  const entries = [];
  const entryBuffer = Buffer.alloc(46);
  let offset = eocd.centralOffset;
  const end = eocd.endOfCentralOffset;
  while (offset >= 0 && offset < end && entries.length < eocd.totalEntries && entries.length < MAX_ZIP_ENTRIES) {
    await handle.read(entryBuffer, 0, 46, offset);
    const signature = entryBuffer.subarray(0, 4);
    if (!signature.equals(Buffer.from('PK\x01\x02'))) break;
    const nameLength = entryBuffer.readUInt16LE(28);
    const extraLength = entryBuffer.readUInt16LE(30);
    const commentLength = entryBuffer.readUInt16LE(32);
    const compressedSize = entryBuffer.readUInt32LE(20);
    const uncompressedSize = entryBuffer.readUInt32LE(24);
    const localHeaderOffset = entryBuffer.readUInt32LE(42);
    const nameBuffer = Buffer.alloc(nameLength);
    await handle.read(nameBuffer, 0, nameLength, offset + 46);
    const name = nameBuffer.toString('utf8');
    entries.push({ name, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

const validateZipBomb = (entries) => {
  let totalCompressed = 0;
  let totalUncompressed = 0;
  for (const entry of entries) {
    totalCompressed += entry.compressedSize;
    totalUncompressed += entry.uncompressedSize;
  }
  if (totalCompressed > 0 && totalUncompressed / totalCompressed > MAX_ZIP_COMPRESSED_RATIO) {
    throw new AppError(422, 'ATTACHMENT_ZIP_BOMB', 'Taxa de compactação do pacote excede o limite permitido.');
  }
  if (totalUncompressed > 50 * 1024 * 1024) {
    throw new AppError(413, 'ATTACHMENT_DECOMPRESSED_TOO_LARGE', 'Conteúdo descompactado excede o limite permitido.');
  }
};

const validateDocxStructure = async (handle, entries) => {
  const names = new Set(entries.map((e) => e.name));
  for (const required of DOCX_REQUIRED_PARTS) {
    if (!names.has(required)) throw new AppError(422, 'ATTACHMENT_DOCX_INVALID_STRUCTURE', `Parte obrigatória ausente: ${required}.`);
  }
  for (const entry of entries) {
    if (entry.name.endsWith('.xml') || entry.name.endsWith('.rels')) {
      const localHeader = Buffer.alloc(4);
      await handle.read(localHeader, 0, 4, entry.localHeaderOffset);
      if (!localHeader.equals(Buffer.from('PK\x03\x04'))) continue;
      const nameLen = localHeader.readUInt16LE(26);
      const extraLen = localHeader.readUInt16LE(28);
      const dataStart = entry.localHeaderOffset + 30 + nameLen + extraLen;
      const compressedSize = localHeader.readUInt32LE(18);
      const data = Buffer.alloc(Math.min(compressedSize, 65536));
      await handle.read(data, 0, data.length, dataStart);
      const text = data.toString('utf8');
      for (const pattern of ACTIVE_CONTENT_PATTERNS) {
        if (pattern.test(text)) throw new AppError(422, 'ATTACHMENT_DOCX_ACTIVE_CONTENT', 'Conteúdo ativo não autorizado no documento DOCX.');
      }
    }
  }
};

const validatePdfStructure = async (filePath) => {
  const prefix = await readPrefix(filePath, 8);
  if (!prefix.subarray(0, 5).equals(PDF_HEADER)) throw new AppError(422, 'ATTACHMENT_PDF_INVALID_HEADER', 'Cabeçalho PDF inválido.');
  const stat = await open(filePath, 'r');
  try {
    const size = (await stat.stat()).size;
    const tailSize = Math.min(size, 1024);
    const tail = Buffer.alloc(tailSize);
    await stat.read(tail, 0, tailSize, size - tailSize);
    const text = tail.toString('latin1');
    for (const pattern of ACTIVE_CONTENT_PATTERNS) {
      if (pattern.test(text)) throw new AppError(422, 'ATTACHMENT_PDF_ACTIVE_CONTENT', 'Conteúdo ativo proibido no documento PDF.');
    }
    const startxref = text.lastIndexOf('startxref');
    if (startxref < 0) throw new AppError(422, 'ATTACHMENT_PDF_MALFORMED', 'Estrutura PDF malformada: startxref ausente.');
  } finally {
    await stat.close();
  }
};

export async function inspectAttachment(file) {
  if (!file?.path || !file.size) throw new AppError(400, 'ATTACHMENT_REQUIRED', 'Selecione um anexo válido.');
  const extension = path.extname(file.originalname ?? '').toLowerCase(); const expected = allowed.get(extension);
  if (!expected) throw new AppError(422, 'ATTACHMENT_EXTENSION_NOT_ALLOWED', 'Formato de anexo não permitido.');
  const prefix = await readPrefix(file.path);
  const detected = await fileTypeFromFile(file.path);
  const isDoc = expected === 'application/msword' && prefix.subarray(0, 8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]));
  const isDocx = expected.includes('openxml') && prefix.subarray(0, 4).equals(Buffer.from('PK\x03\x04'));
  if (!(detected?.mime === expected || isDoc || isDocx)) throw new AppError(422, 'ATTACHMENT_CONTENT_MISMATCH', 'A extensão não corresponde ao conteúdo do arquivo.');
  const originalName = path.basename(file.originalname).replace(/[<>:"/\\|?*]/g, '_').replaceAll('\0', '_').slice(0, 255);
  const result = { mimeType: expected, extension, checksum: await sha256(file.path), sizeBytes: file.size, originalName };
  if (isDocx) {
    const handle = await open(file.path, 'r');
    try {
      const eocd = await zipCentralDirectory(handle);
      const entries = await enumerateZipEntries(handle, eocd);
      validateZipBomb(entries);
      await validateDocxStructure(handle, entries);
    } finally {
      await handle.close();
    }
  }
  if (expected === 'application/pdf') {
    await validatePdfStructure(file.path);
  }
  return result;
}
