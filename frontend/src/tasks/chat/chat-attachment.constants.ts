/**
 * Constantes canônicas de validação e limites de anexos do Chat.
 * Alinhado estritamente com backend/src/modules/chat/chat-attachment.validation.js
 */

export const CHAT_ATTACHMENT_MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MiB = 20.971.520 bytes
export const CHAT_ATTACHMENT_MAX_FILES_PER_MESSAGE = 5;
export const CHAT_ATTACHMENT_MAX_MESSAGE_BYTES = 50 * 1024 * 1024; // 50 MiB = 52.428.800 bytes

export const CHAT_ATTACHMENT_USER_QUOTA_BYTES = 100 * 1024 * 1024; // 100 MiB = 104.857.600 bytes
export const CHAT_ATTACHMENT_CONVERSATION_QUOTA_BYTES = 250 * 1024 * 1024; // 250 MiB = 262.144.000 bytes

export const ALLOWED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
  '.docx',
  '.xlsx',
  '.txt',
] as const;

export type AllowedExtension = typeof ALLOWED_EXTENSIONS[number];

export const ALLOWED_MIME_TYPES: Record<AllowedExtension, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
};

export const ACCEPT_ATTRIBUTE = ALLOWED_EXTENSIONS.join(',');
