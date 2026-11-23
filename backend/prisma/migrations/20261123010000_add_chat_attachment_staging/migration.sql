-- Fase 5.1.2: staging privado e metadados futuros de anexos do Chat.
CREATE TABLE `chat_attachment_uploads` (
  `id` CHAR(36) NOT NULL, `conversationId` CHAR(36) NOT NULL,
  `uploadedById` CHAR(36) NOT NULL, `clientUploadId` CHAR(36) NOT NULL,
  `messageId` CHAR(36) NULL, `originalName` VARCHAR(255) NOT NULL,
  `stagingKey` VARCHAR(180) NOT NULL, `targetStorageKey` VARCHAR(180) NULL,
  `mimeType` VARCHAR(127) NOT NULL, `extension` VARCHAR(10) NOT NULL,
  `sizeBytes` BIGINT UNSIGNED NOT NULL, `sha256` CHAR(64) NOT NULL,
  `status` ENUM('STAGED','READY','CLAIMED','PROMOTED','REJECTED','FAILED','EXPIRED') NOT NULL DEFAULT 'STAGED',
  `expiresAt` DATETIME(3) NOT NULL, `claimedAt` DATETIME(3) NULL,
  `promotedAt` DATETIME(3) NULL, `failedAt` DATETIME(3) NULL,
  `attemptCount` SMALLINT UNSIGNED NOT NULL DEFAULT 0, `failureCode` VARCHAR(100) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `chat_attachment_uploads_stagingKey_key` (`stagingKey`),
  UNIQUE INDEX `chat_attachment_uploads_targetStorageKey_key` (`targetStorageKey`),
  UNIQUE INDEX `chat_attachment_uploads_idempotency_key` (`conversationId`, `uploadedById`, `clientUploadId`),
  INDEX `chat_attachment_uploads_status_expiresAt_idx` (`status`, `expiresAt`),
  INDEX `chat_attachment_uploads_uploadedBy_status_expiresAt_idx` (`uploadedById`, `status`, `expiresAt`),
  INDEX `chat_attachment_uploads_conversation_status_expiresAt_idx` (`conversationId`, `status`, `expiresAt`),
  INDEX `chat_attachment_uploads_message_status_idx` (`messageId`, `status`),
  CONSTRAINT `chat_attachment_uploads_conversation_fkey` FOREIGN KEY (`conversationId`) REFERENCES `chat_conversations` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chat_attachment_uploads_uploader_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chat_attachment_uploads_message_conversation_fkey` FOREIGN KEY (`messageId`, `conversationId`) REFERENCES `chat_messages` (`id`, `conversationId`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `chat_message_attachments`
  ADD COLUMN `sourceUploadId` CHAR(36) NULL,
  ADD COLUMN `uploadedById` CHAR(36) NULL,
  ADD COLUMN `position` SMALLINT UNSIGNED NULL,
  ADD UNIQUE INDEX `chat_message_attachments_storagePath_key` (`storagePath`),
  ADD UNIQUE INDEX `chat_message_attachments_sourceUploadId_key` (`sourceUploadId`),
  ADD UNIQUE INDEX `chat_message_attachments_messageId_position_key` (`messageId`, `position`),
  ADD INDEX `chat_message_attachments_uploadedById_idx` (`uploadedById`),
  ADD CONSTRAINT `chat_message_attachments_sourceUploadId_fkey` FOREIGN KEY (`sourceUploadId`) REFERENCES `chat_attachment_uploads` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `chat_message_attachments_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- (messageId, sha256) é regra futura da Fase 5.1.3, não constraint nesta fase.
