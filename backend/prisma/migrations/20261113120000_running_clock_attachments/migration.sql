-- Phase: running-clock deadlines and generic task attachments.
--
-- This migration is intentionally additive. It preserves all calendar rows,
-- TaskImage rows and legacy deadlines. Existing cycles remain
-- LEGACY_CALENDAR; application code must opt new cycles into RUNNING_CLOCK.
-- Do not apply this migration until the compatibility checks in
-- docs/RUNNING-CLOCK-IMPLEMENTATION-PLAN.md are approved.

ALTER TABLE `task_cycles`
  ADD COLUMN `deadlinePolicy` ENUM('LEGACY_CALENDAR', 'RUNNING_CLOCK') NOT NULL DEFAULT 'LEGACY_CALENDAR' AFTER `status`,
  ADD COLUMN `acceptanceDurationMinutes` INTEGER UNSIGNED NULL AFTER `deadlinePolicy`,
  ADD COLUMN `executionDurationMinutes` INTEGER UNSIGNED NULL AFTER `acceptanceDurationMinutes`,
  ADD COLUMN `acceptanceDeadlineAt` DATETIME(3) NULL AFTER `executionDurationMinutes`,
  ADD COLUMN `executionDeadlineAt` DATETIME(3) NULL AFTER `acceptanceDeadlineAt`,
  ADD INDEX `task_cycles_status_acceptanceDeadlineAt_idx` (`status`, `acceptanceDeadlineAt`),
  ADD INDEX `task_cycles_status_executionDeadlineAt_idx` (`status`, `executionDeadlineAt`);

-- New running-clock assignments have no calendar version. Historical rows keep
-- their existing FK and continue to use the legacy calendar metrics.
ALTER TABLE `task_assignments`
  MODIFY COLUMN `calendarVersionId` CHAR(36) NULL,
  ADD COLUMN `acceptanceDeadlineAt` DATETIME(3) NULL AFTER `calendarVersionId`;

ALTER TABLE `deadline_changes`
  ADD COLUMN `kind` ENUM('LEGACY', 'EXECUTION_EXTENSION', 'RETURN_PAUSE', 'ADMINISTRATIVE') NOT NULL DEFAULT 'LEGACY' AFTER `newDeadlineAt`,
  ADD INDEX `deadline_changes_cycleId_kind_createdAt_idx` (`cycleId`, `kind`, `createdAt`);

CREATE TABLE `task_attachments` (
  `id` CHAR(36) NOT NULL,
  `cycleId` CHAR(36) NOT NULL,
  `uploadedById` CHAR(36) NOT NULL,
  `origin` ENUM('INITIAL', 'EXECUTION') NOT NULL,
  `originalName` VARCHAR(255) NOT NULL,
  `storageKey` VARCHAR(512) NOT NULL,
  `mimeType` VARCHAR(100) NOT NULL,
  `sizeBytes` BIGINT UNSIGNED NOT NULL,
  `checksum` CHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3) NULL,

  UNIQUE INDEX `task_attachments_storageKey_key` (`storageKey`),
  INDEX `task_attachments_cycleId_origin_deletedAt_idx` (`cycleId`, `origin`, `deletedAt`),
  INDEX `task_attachments_uploadedById_idx` (`uploadedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `task_attachments`
  ADD CONSTRAINT `task_attachments_cycleId_fkey`
    FOREIGN KEY (`cycleId`) REFERENCES `task_cycles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `task_attachments_uploadedById_fkey`
    FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE `staged_uploads` (
  `id` CHAR(36) NOT NULL,
  `uploadedById` CHAR(36) NOT NULL,
  `originalName` VARCHAR(255) NOT NULL,
  `stagingKey` VARCHAR(512) NOT NULL,
  `mimeType` VARCHAR(100) NOT NULL,
  `sizeBytes` BIGINT UNSIGNED NOT NULL,
  `checksum` CHAR(64) NOT NULL,
  `status` ENUM('STAGED', 'CLAIMED', 'EXPIRED') NOT NULL DEFAULT 'STAGED',
  `expiresAt` DATETIME(3) NOT NULL,
  `claimedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `staged_uploads_stagingKey_key` (`stagingKey`),
  INDEX `staged_uploads_uploadedById_status_expiresAt_idx` (`uploadedById`, `status`, `expiresAt`),
  INDEX `staged_uploads_status_expiresAt_idx` (`status`, `expiresAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `staged_uploads_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
