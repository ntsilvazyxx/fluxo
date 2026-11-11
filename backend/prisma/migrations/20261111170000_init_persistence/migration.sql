-- CreateTable
CREATE TABLE `roles` (
    `id` CHAR(36) NOT NULL,
    `code` ENUM('ADMIN_MASTER', 'SECRETARY', 'MANAGER', 'TECHNICIAN') NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `emailNormalized` VARCHAR(254) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `roleId` CHAR(36) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `users_emailNormalized_key`(`emailNormalized`),
    INDEX `users_roleId_isActive_idx`(`roleId`, `isActive`),
    INDEX `users_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `teams` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `calendarId` CHAR(36) NULL,
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `teams_calendarId_key`(`calendarId`),
    INDEX `teams_isActive_name_idx`(`isActive`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `team_members` (
    `id` CHAR(36) NOT NULL,
    `teamId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL,
    `leftAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `team_members_teamId_leftAt_idx`(`teamId`, `leftAt`),
    INDEX `team_members_userId_leftAt_idx`(`userId`, `leftAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `team_managers` (
    `id` CHAR(36) NOT NULL,
    `teamId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `team_managers_teamId_endedAt_idx`(`teamId`, `endedAt`),
    INDEX `team_managers_userId_endedAt_idx`(`userId`, `endedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `work_calendars` (
    `id` CHAR(36) NOT NULL,
    `teamId` CHAR(36) NOT NULL,
    `timezone` VARCHAR(64) NOT NULL,
    `activeVersionId` CHAR(36) NULL,
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `work_calendars_teamId_key`(`teamId`),
    UNIQUE INDEX `work_calendars_activeVersionId_key`(`activeVersionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `calendar_versions` (
    `id` CHAR(36) NOT NULL,
    `calendarId` CHAR(36) NOT NULL,
    `versionNumber` INTEGER UNSIGNED NOT NULL,
    `effectiveFrom` DATETIME(3) NOT NULL,
    `effectiveTo` DATETIME(3) NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdById` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `calendar_versions_calendarId_effectiveFrom_effectiveTo_idx`(`calendarId`, `effectiveFrom`, `effectiveTo`),
    UNIQUE INDEX `calendar_versions_calendarId_versionNumber_key`(`calendarId`, `versionNumber`),
    UNIQUE INDEX `calendar_versions_id_calendarId_key`(`id`, `calendarId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `work_schedules` (
    `id` CHAR(36) NOT NULL,
    `calendarVersionId` CHAR(36) NOT NULL,
    `weekday` TINYINT UNSIGNED NOT NULL,
    `startMinute` SMALLINT UNSIGNED NOT NULL,
    `endMinute` SMALLINT UNSIGNED NOT NULL,

    INDEX `work_schedules_calendarVersionId_weekday_idx`(`calendarVersionId`, `weekday`),
    UNIQUE INDEX `work_schedules_calendarVersionId_weekday_startMinute_endMinu_key`(`calendarVersionId`, `weekday`, `startMinute`, `endMinute`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `calendar_exceptions` (
    `id` CHAR(36) NOT NULL,
    `calendarVersionId` CHAR(36) NOT NULL,
    `localDate` DATE NOT NULL,
    `type` ENUM('HOLIDAY', 'WORKING_PERIOD') NOT NULL,
    `startMinute` SMALLINT UNSIGNED NULL,
    `endMinute` SMALLINT UNSIGNED NULL,
    `description` VARCHAR(255) NULL,

    INDEX `calendar_exceptions_calendarVersionId_localDate_idx`(`calendarVersionId`, `localDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tasks` (
    `id` CHAR(36) NOT NULL,
    `publicNumber` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `teamId` CHAR(36) NOT NULL,
    `createdById` CHAR(36) NOT NULL,
    `parentCycleId` CHAR(36) NULL,
    `currentCycleId` CHAR(36) NULL,
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `tasks_publicNumber_key`(`publicNumber`),
    UNIQUE INDEX `tasks_currentCycleId_key`(`currentCycleId`),
    INDEX `tasks_teamId_deletedAt_idx`(`teamId`, `deletedAt`),
    INDEX `tasks_createdById_idx`(`createdById`),
    INDEX `tasks_parentCycleId_idx`(`parentCycleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_cycles` (
    `id` CHAR(36) NOT NULL,
    `taskId` CHAR(36) NOT NULL,
    `cycleNumber` INTEGER UNSIGNED NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `priority` ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    `status` ENUM('PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `deadlineAt` DATETIME(3) NULL,
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `openedAt` DATETIME(3) NOT NULL,
    `closedAt` DATETIME(3) NULL,
    `completionText` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `task_cycles_status_deadlineAt_idx`(`status`, `deadlineAt`),
    INDEX `task_cycles_priority_status_idx`(`priority`, `status`),
    UNIQUE INDEX `task_cycles_taskId_cycleNumber_key`(`taskId`, `cycleNumber`),
    UNIQUE INDEX `task_cycles_id_taskId_key`(`id`, `taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_assignments` (
    `id` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `assignedById` CHAR(36) NOT NULL,
    `calendarVersionId` CHAR(36) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `endReason` ENUM('REJECTED', 'REASSIGNED', 'RETURN_APPROVED', 'COMPLETED', 'CANCELLED') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `task_assignments_cycleId_endedAt_idx`(`cycleId`, `endedAt`),
    INDEX `task_assignments_userId_endedAt_idx`(`userId`, `endedAt`),
    INDEX `task_assignments_calendarVersionId_idx`(`calendarVersionId`),
    UNIQUE INDEX `task_assignments_id_cycleId_key`(`id`, `cycleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_requests` (
    `id` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `assignmentId` CHAR(36) NOT NULL,
    `type` ENUM('RETURN', 'EXTENSION') NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'DENIED', 'CLOSED_BY_COMPLETION', 'CLOSED_BY_ADMIN_CHANGE', 'CLOSED_BY_REASSIGNMENT', 'CLOSED_BY_CANCELLATION') NOT NULL DEFAULT 'PENDING',
    `reason` TEXT NOT NULL,
    `proposedDeadlineAt` DATETIME(3) NULL,
    `decidedById` CHAR(36) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `task_requests_assignmentId_type_status_idx`(`assignmentId`, `type`, `status`),
    INDEX `task_requests_cycleId_status_idx`(`cycleId`, `status`),
    INDEX `task_requests_decidedById_idx`(`decidedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_pause_intervals` (
    `id` CHAR(36) NOT NULL,
    `assignmentId` CHAR(36) NOT NULL,
    `requestId` CHAR(36) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `task_pause_intervals_assignmentId_endedAt_idx`(`assignmentId`, `endedAt`),
    UNIQUE INDEX `task_pause_intervals_requestId_startedAt_key`(`requestId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `deadline_changes` (
    `id` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `oldDeadlineAt` DATETIME(3) NULL,
    `newDeadlineAt` DATETIME(3) NOT NULL,
    `reason` TEXT NOT NULL,
    `changedById` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `deadline_changes_cycleId_createdAt_idx`(`cycleId`, `createdAt`),
    INDEX `deadline_changes_changedById_idx`(`changedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_images` (
    `id` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `uploadedById` CHAR(36) NOT NULL,
    `storageKey` VARCHAR(512) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `sizeBytes` BIGINT UNSIGNED NOT NULL,
    `checksum` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `task_images_storageKey_key`(`storageKey`),
    INDEX `task_images_cycleId_deletedAt_idx`(`cycleId`, `deletedAt`),
    INDEX `task_images_uploadedById_idx`(`uploadedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_cycle_notes` (
    `id` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `authorId` CHAR(36) NOT NULL,
    `content` TEXT NOT NULL,
    `reason` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `task_cycle_notes_cycleId_createdAt_idx`(`cycleId`, `createdAt`),
    INDEX `task_cycle_notes_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_events` (
    `id` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NULL,
    `entityType` VARCHAR(100) NOT NULL,
    `entityId` CHAR(36) NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `beforeJson` JSON NULL,
    `afterJson` JSON NULL,
    `reason` TEXT NULL,
    `correlationId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_events_entityType_entityId_createdAt_idx`(`entityType`, `entityId`, `createdAt`),
    INDEX `audit_events_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `audit_events_correlationId_idx`(`correlationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `type` VARCHAR(100) NOT NULL,
    `title` VARCHAR(180) NOT NULL,
    `body` TEXT NOT NULL,
    `entityType` VARCHAR(100) NOT NULL,
    `entityId` CHAR(36) NOT NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_userId_readAt_createdAt_idx`(`userId`, `readAt`, `createdAt`),
    INDEX `notifications_entityType_entityId_idx`(`entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outbox_events` (
    `id` CHAR(36) NOT NULL,
    `eventType` VARCHAR(120) NOT NULL,
    `payloadJson` JSON NOT NULL,
    `dedupeKey` VARCHAR(255) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NULL,
    `claimedAt` DATETIME(3) NULL,
    `processedAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `outbox_events_dedupeKey_key`(`dedupeKey`),
    INDEX `outbox_events_status_nextAttemptAt_createdAt_idx`(`status`, `nextAttemptAt`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_deliveries` (
    `id` CHAR(36) NOT NULL,
    `outboxEventId` CHAR(36) NOT NULL,
    `recipient` VARCHAR(254) NOT NULL,
    `status` ENUM('PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attemptCount` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `email_deliveries_status_createdAt_idx`(`status`, `createdAt`),
    UNIQUE INDEX `email_deliveries_outboxEventId_recipient_key`(`outboxEventId`, `recipient`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `idempotency_keys` (
    `id` CHAR(36) NOT NULL,
    `actorId` CHAR(36) NOT NULL,
    `key` VARCHAR(255) NOT NULL,
    `requestHash` CHAR(64) NOT NULL,
    `responseStatus` SMALLINT UNSIGNED NULL,
    `responseBodyJson` JSON NULL,
    `state` ENUM('PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PROCESSING',
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `idempotency_keys_expiresAt_idx`(`expiresAt`),
    UNIQUE INDEX `idempotency_keys_actorId_key_key`(`actorId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_sessions` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `refreshTokenHash` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `user_sessions_refreshTokenHash_key`(`refreshTokenHash`),
    INDEX `user_sessions_userId_revokedAt_expiresAt_idx`(`userId`, `revokedAt`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_reset_tokens` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,

    UNIQUE INDEX `password_reset_tokens_tokenHash_key`(`tokenHash`),
    INDEX `password_reset_tokens_userId_expiresAt_idx`(`userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mfa_credentials` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `type` ENUM('TOTP', 'WEBAUTHN') NOT NULL,
    `credentialId` VARCHAR(512) NULL,
    `secretCiphertext` TEXT NULL,
    `credentialJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `mfa_credentials_credentialId_key`(`credentialId`),
    INDEX `mfa_credentials_userId_revokedAt_idx`(`userId`, `revokedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_preferences` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `notificationType` VARCHAR(100) NOT NULL,
    `internalEnabled` BOOLEAN NOT NULL DEFAULT true,
    `emailEnabled` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `notification_preferences_userId_notificationType_key`(`userId`, `notificationType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_settings` (
    `key` VARCHAR(100) NOT NULL,
    `valueJson` JSON NOT NULL,
    `description` VARCHAR(255) NULL,
    `version` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `updatedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `system_settings_updatedById_idx`(`updatedById`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `teams` ADD CONSTRAINT `teams_calendarId_fkey` FOREIGN KEY (`calendarId`) REFERENCES `work_calendars`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `team_members` ADD CONSTRAINT `team_members_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `team_members` ADD CONSTRAINT `team_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `team_managers` ADD CONSTRAINT `team_managers_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `team_managers` ADD CONSTRAINT `team_managers_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `work_calendars` ADD CONSTRAINT `work_calendars_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `work_calendars` ADD CONSTRAINT `work_calendars_activeVersionId_fkey` FOREIGN KEY (`activeVersionId`) REFERENCES `calendar_versions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `calendar_versions` ADD CONSTRAINT `calendar_versions_calendarId_fkey` FOREIGN KEY (`calendarId`) REFERENCES `work_calendars`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `calendar_versions` ADD CONSTRAINT `calendar_versions_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `work_schedules` ADD CONSTRAINT `work_schedules_calendarVersionId_fkey` FOREIGN KEY (`calendarVersionId`) REFERENCES `calendar_versions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `calendar_exceptions` ADD CONSTRAINT `calendar_exceptions_calendarVersionId_fkey` FOREIGN KEY (`calendarVersionId`) REFERENCES `calendar_versions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_parentCycleId_fkey` FOREIGN KEY (`parentCycleId`) REFERENCES `task_cycles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_currentCycleId_fkey` FOREIGN KEY (`currentCycleId`) REFERENCES `task_cycles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `task_cycles` ADD CONSTRAINT `task_cycles_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `task_cycles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_calendarVersionId_fkey` FOREIGN KEY (`calendarVersionId`) REFERENCES `calendar_versions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `task_requests` ADD CONSTRAINT `task_requests_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `task_cycles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `task_requests` ADD CONSTRAINT `task_requests_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `task_assignments`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `task_requests` ADD CONSTRAINT `task_requests_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `task_pause_intervals` ADD CONSTRAINT `task_pause_intervals_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `task_assignments`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `task_pause_intervals` ADD CONSTRAINT `task_pause_intervals_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `task_requests`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `deadline_changes` ADD CONSTRAINT `deadline_changes_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `task_cycles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `deadline_changes` ADD CONSTRAINT `deadline_changes_changedById_fkey` FOREIGN KEY (`changedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `task_images` ADD CONSTRAINT `task_images_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `task_cycles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `task_images` ADD CONSTRAINT `task_images_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `task_cycle_notes` ADD CONSTRAINT `task_cycle_notes_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `task_cycles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `task_cycle_notes` ADD CONSTRAINT `task_cycle_notes_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `audit_events` ADD CONSTRAINT `audit_events_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `email_deliveries` ADD CONSTRAINT `email_deliveries_outboxEventId_fkey` FOREIGN KEY (`outboxEventId`) REFERENCES `outbox_events`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `idempotency_keys` ADD CONSTRAINT `idempotency_keys_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `mfa_credentials` ADD CONSTRAINT `mfa_credentials_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `system_settings` ADD CONSTRAINT `system_settings_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
