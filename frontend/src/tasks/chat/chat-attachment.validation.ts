import {
  ALLOWED_EXTENSIONS,
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  CHAT_ATTACHMENT_MAX_FILES_PER_MESSAGE,
  CHAT_ATTACHMENT_MAX_MESSAGE_BYTES,
} from './chat-attachment.constants.ts';
import type {
  AttachmentValidationResult,
  BatchSelectionResult,
  LocalAttachment,
} from './chat-attachment.types.ts';

/**
 * Sanitiza o nome do arquivo para apresentação segura na interface.
 */
export function sanitizeAttachmentName(name: string): string {
  if (!name || typeof name !== 'string') {
    return 'anexo';
  }
  // Normaliza e remove caracteres de controle ou path traversal
  const cleaned = name
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();

  return cleaned.slice(0, 255) || 'anexo';
}

/**
 * Obtém a extensão minúscula do arquivo.
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0) return '';
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Validação preliminar individual de um arquivo no frontend.
 */
export function validateSingleFile(file: File): AttachmentValidationResult {
  if (!file) {
    return {
      valid: false,
      errorCode: 'CHAT_ATTACHMENT_REQUIRED',
      errorMessage: 'Arquivo não informado.',
    };
  }

  // 1. Arquivo vazio (0 bytes)
  if (file.size === 0) {
    return {
      valid: false,
      errorCode: 'CHAT_ATTACHMENT_EMPTY',
      errorMessage: 'Arquivo vazio não é permitido.',
    };
  }

  // 2. Tamanho individual máximo (20 MiB = 20.971.520 bytes)
  if (file.size > CHAT_ATTACHMENT_MAX_FILE_BYTES) {
    return {
      valid: false,
      errorCode: 'CHAT_ATTACHMENT_TOO_LARGE',
      errorMessage: 'O arquivo excede o limite máximo permitido de 20 MB.',
    };
  }

  // 3. Whitelist estrita de extensões permitidas
  const ext = getFileExtension(file.name);
  const isAllowed = ALLOWED_EXTENSIONS.includes(ext as any);
  if (!isAllowed) {
    return {
      valid: false,
      errorCode: 'CHAT_ATTACHMENT_EXTENSION_NOT_ALLOWED',
      errorMessage: 'Formato não suportado. Envie apenas JPG, PNG, WEBP, PDF, DOCX, XLSX ou TXT.',
    };
  }

  return { valid: true };
}

/**
 * Valida uma seleção de arquivos (seletor nativo ou drag-and-drop), considerando a fila ativa.
 */
export function validateBatchSelection(
  newFiles: File[],
  currentQueue: LocalAttachment[],
): BatchSelectionResult {
  const accepted: LocalAttachment[] = [];
  const rejected: Array<{ file: File; errorCode: string; errorMessage: string }> = [];

  // Considera apenas anexos ativos (não expirados nem com erro terminal de remoção)
  const activeQueue = currentQueue.filter(
    (item) => item.localStatus !== 'EXPIRED',
  );

  let currentCount = activeQueue.length;
  let currentTotalBytes = activeQueue.reduce((acc, item) => acc + item.sizeBytes, 0);

  for (const file of newFiles) {
    // 1. Validação individual intrínseca do arquivo
    const singleValidation = validateSingleFile(file);
    if (!singleValidation.valid) {
      rejected.push({
        file,
        errorCode: singleValidation.errorCode || 'INVALID_FILE',
        errorMessage: singleValidation.errorMessage || 'Arquivo inválido.',
      });
      continue;
    }

    // 2. Prevenção de seleção repetida do mesmo arquivo físico no lote atual
    const isDuplicate = activeQueue.some(
      (item) =>
        item.originalName === file.name &&
        item.sizeBytes === file.size &&
        item.file?.lastModified === file.lastModified,
    ) || accepted.some(
      (item) =>
        item.originalName === file.name &&
        item.sizeBytes === file.size &&
        item.file?.lastModified === file.lastModified,
    );

    if (isDuplicate) {
      rejected.push({
        file,
        errorCode: 'CHAT_ATTACHMENT_DUPLICATE_IN_QUEUE',
        errorMessage: `O arquivo "${file.name}" já está na fila de anexos.`,
      });
      continue;
    }

    // 3. Limite de quantidade total de anexos (máximo 5)
    if (currentCount + 1 > CHAT_ATTACHMENT_MAX_FILES_PER_MESSAGE) {
      rejected.push({
        file,
        errorCode: 'CHAT_ATTACHMENT_LIMIT_EXCEEDED',
        errorMessage: `Limite de ${CHAT_ATTACHMENT_MAX_FILES_PER_MESSAGE} anexos por mensagem atingido.`,
      });
      continue;
    }

    // 4. Limite agregado de tamanho (máximo 50 MiB = 52.428.800 bytes)
    if (currentTotalBytes + file.size > CHAT_ATTACHMENT_MAX_MESSAGE_BYTES) {
      rejected.push({
        file,
        errorCode: 'CHAT_ATTACHMENT_MESSAGE_TOO_LARGE',
        errorMessage: 'O tamanho total dos anexos excede o limite de 50 MB por mensagem.',
      });
      continue;
    }

    // Arquivo aprovado para a fila
    const localId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const clientUploadId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    accepted.push({
      localId,
      clientUploadId,
      file,
      originalName: sanitizeAttachmentName(file.name),
      sizeBytes: file.size,
      mimeType: file.type || undefined,
      localStatus: 'SELECTED',
      progress: 0,
    });

    currentCount += 1;
    currentTotalBytes += file.size;
  }

  return { accepted, rejected };
}
