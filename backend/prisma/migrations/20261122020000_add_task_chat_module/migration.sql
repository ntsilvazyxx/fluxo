-- CreateTable
CREATE TABLE `chat_conversations` (
    `id` CHAR(36) NOT NULL,
    `taskId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `chat_conversations_taskId_key`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_participants` (
    `id` CHAR(36) NOT NULL,
    `conversationId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `chat_participants_userId_idx`(`userId`),
    UNIQUE INDEX `chat_participants_conversationId_userId_key`(`conversationId`, `userId`),
    UNIQUE INDEX `chat_participants_id_conversationId_key`(`id`, `conversationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_participation_periods` (
    `id` CHAR(36) NOT NULL,
    `participantId` CHAR(36) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,
    `endReason` ENUM('REASSIGNED', 'REMOVED_BY_MANAGER', 'ACCOUNT_DEACTIVATED', 'ASSIGNMENT_REJECTED', 'CYCLE_ENDED') NULL,
    `addedById` CHAR(36) NOT NULL,
    `removedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chat_participation_periods_participantId_joinedAt_idx`(`participantId`, `joinedAt`),
    INDEX `chat_participation_periods_endedAt_idx`(`endedAt`),
    INDEX `chat_participation_periods_addedById_idx`(`addedById`),
    INDEX `chat_participation_periods_removedById_idx`(`removedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_messages` (
    `id` CHAR(36) NOT NULL,
    `conversationId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `authorId` CHAR(36) NOT NULL,
    `sequenceNumber` BIGINT UNSIGNED NOT NULL,
    `clientMessageId` CHAR(36) NOT NULL,
    `content` TEXT NULL,
    `status` ENUM('PENDING', 'PUBLISHED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `reconciliationClaimToken` CHAR(36) NULL,
    `reconciliationClaimedAt` DATETIME(3) NULL,
    `reconciliationClaimExpiresAt` DATETIME(3) NULL,
    `reconciliationAttempts` TINYINT NOT NULL DEFAULT 0,
    `failureReason` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `publishedAt` DATETIME(3) NULL,

    INDEX `chat_messages_cycleId_idx`(`cycleId`),
    INDEX `chat_messages_authorId_idx`(`authorId`),
    INDEX `chat_messages_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `chat_messages_reconciliationClaimExpiresAt_idx`(`reconciliationClaimExpiresAt`),
    UNIQUE INDEX `chat_messages_conversationId_sequenceNumber_key`(`conversationId`, `sequenceNumber`),
    UNIQUE INDEX `chat_messages_conversationId_clientMessageId_key`(`conversationId`, `clientMessageId`),
    UNIQUE INDEX `chat_messages_id_conversationId_key`(`id`, `conversationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_message_attachments` (
    `id` CHAR(36) NOT NULL,
    `messageId` CHAR(36) NOT NULL,
    `originalName` VARCHAR(255) NOT NULL,
    `storagePath` VARCHAR(500) NOT NULL,
    `mimeType` VARCHAR(127) NOT NULL,
    `sizeBytes` BIGINT UNSIGNED NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `origin` ENUM('UPLOAD', 'SYSTEM_GENERATED') NOT NULL DEFAULT 'UPLOAD',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chat_message_attachments_messageId_idx`(`messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_read_receipts` (
    `id` CHAR(36) NOT NULL,
    `conversationId` CHAR(36) NOT NULL,
    `participantId` CHAR(36) NOT NULL,
    `lastReadMessageId` CHAR(36) NULL,
    `lastReadSequence` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `lastReadAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `chat_read_receipts_participantId_key`(`participantId`),
    INDEX `chat_read_receipts_conversationId_idx`(`conversationId`),
    INDEX `chat_read_receipts_lastReadMessageId_idx`(`lastReadMessageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_functional_read_states` (
    `id` CHAR(36) NOT NULL,
    `conversationId` CHAR(36) NOT NULL,
    `userId` CHAR(36) NOT NULL,
    `lastReadMessageId` CHAR(36) NULL,
    `lastReadSequence` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `lastReadAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `chat_functional_read_states_userId_idx`(`userId`),
    INDEX `chat_functional_read_states_lastReadMessageId_idx`(`lastReadMessageId`),
    UNIQUE INDEX `chat_functional_read_states_conversationId_userId_key`(`conversationId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_lock_states` (
    `id` CHAR(36) NOT NULL,
    `conversationId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `isLocked` BOOLEAN NOT NULL DEFAULT false,
    `reason` ENUM('REQUEST_PENDING', 'CYCLE_CLOSED', 'ADMIN_MAINTENANCE') NULL,
    `requestId` CHAR(36) NULL,
    `lockedAt` DATETIME(3) NULL,
    `lockedById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `chat_lock_states_conversationId_key`(`conversationId`),
    INDEX `chat_lock_states_cycleId_idx`(`cycleId`),
    INDEX `chat_lock_states_lockedById_idx`(`lockedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_lock_events` (
    `id` CHAR(36) NOT NULL,
    `conversationId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `eventType` ENUM('LOCK_ACQUIRED', 'LOCK_REASSERTED', 'LOCK_RELEASED', 'DECISION_RECORDED_WHILE_UNLOCKED', 'CYCLE_TERMINATED', 'CYCLE_REOPENED', 'ADMIN_INTERVENTION') NOT NULL,
    `actorId` CHAR(36) NULL,
    `reason` ENUM('REQUEST_PENDING', 'CYCLE_CLOSED', 'ADMIN_MAINTENANCE') NULL,
    `requestId` CHAR(36) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chat_lock_events_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    INDEX `chat_lock_events_cycleId_idx`(`cycleId`),
    INDEX `chat_lock_events_actorId_idx`(`actorId`),
    INDEX `chat_lock_events_requestId_idx`(`requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `chat_conversations` ADD CONSTRAINT `chat_conversations_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_participants` ADD CONSTRAINT `chat_participants_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `chat_conversations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_participants` ADD CONSTRAINT `chat_participants_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_participation_periods` ADD CONSTRAINT `chat_participation_periods_participantId_fkey` FOREIGN KEY (`participantId`) REFERENCES `chat_participants`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_participation_periods` ADD CONSTRAINT `chat_participation_periods_addedById_fkey` FOREIGN KEY (`addedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_participation_periods` ADD CONSTRAINT `chat_participation_periods_removedById_fkey` FOREIGN KEY (`removedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `chat_conversations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `task_cycles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_message_attachments` ADD CONSTRAINT `chat_message_attachments_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `chat_messages`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_read_receipts` ADD CONSTRAINT `chat_read_receipts_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `chat_conversations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_read_receipts` ADD CONSTRAINT `chat_read_receipts_participantId_fkey` FOREIGN KEY (`participantId`) REFERENCES `chat_participants`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_read_receipts` ADD CONSTRAINT `chat_read_receipts_lastReadMessageId_fkey` FOREIGN KEY (`lastReadMessageId`) REFERENCES `chat_messages`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_functional_read_states` ADD CONSTRAINT `chat_functional_read_states_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `chat_conversations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_functional_read_states` ADD CONSTRAINT `chat_functional_read_states_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_functional_read_states` ADD CONSTRAINT `chat_functional_read_states_lastReadMessageId_fkey` FOREIGN KEY (`lastReadMessageId`) REFERENCES `chat_messages`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_lock_states` ADD CONSTRAINT `chat_lock_states_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `chat_conversations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_lock_states` ADD CONSTRAINT `chat_lock_states_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `task_cycles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_lock_states` ADD CONSTRAINT `chat_lock_states_lockedById_fkey` FOREIGN KEY (`lockedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_lock_events` ADD CONSTRAINT `chat_lock_events_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `chat_conversations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_lock_events` ADD CONSTRAINT `chat_lock_events_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `task_cycles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_lock_events` ADD CONSTRAINT `chat_lock_events_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `chat_lock_events` ADD CONSTRAINT `chat_lock_events_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `task_requests`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ============================================================================
-- REGRAS COMPLEMENTARES DE INTEGRIDADE E CONSTRAINTS (MARIADB 10.11)
-- ============================================================================

-- 1. Unicidade de período ativo por participante (máximo de 1 período com endedAt IS NULL)
ALTER TABLE `chat_participation_periods`
  ADD COLUMN `activePeriodKey` VARCHAR(36)
    GENERATED ALWAYS AS (
      CASE WHEN `endedAt` IS NULL THEN RTRIM(`participantId`) ELSE NULL END
    ) STORED,
  ADD UNIQUE INDEX `chat_periods_one_active_per_participant_key` (`activePeriodKey`);

-- 2. Integridade referencial composta para isolamento de leitura (mesma conversa)
ALTER TABLE `chat_read_receipts`
  ADD CONSTRAINT `chat_read_receipts_participant_same_conversation_fkey`
    FOREIGN KEY (`participantId`, `conversationId`)
    REFERENCES `chat_participants` (`id`, `conversationId`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `chat_read_receipts_message_same_conversation_fkey`
    FOREIGN KEY (`lastReadMessageId`, `conversationId`)
    REFERENCES `chat_messages` (`id`, `conversationId`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `chat_functional_read_states`
  ADD CONSTRAINT `chat_functional_read_message_same_conversation_fkey`
    FOREIGN KEY (`lastReadMessageId`, `conversationId`)
    REFERENCES `chat_messages` (`id`, `conversationId`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- 3. Integridade entre Tarefa, Conversa, Ciclo e Solicitações
CREATE TRIGGER `trg_chat_messages_cycle_match_insert`
BEFORE INSERT ON `chat_messages`
FOR EACH ROW
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM `chat_conversations` c
      JOIN `task_cycles` tc ON tc.`id` = NEW.`cycleId`
     WHERE c.`id` = NEW.`conversationId`
       AND tc.`taskId` = c.`taskId`
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Message cycle must belong to the same task as the conversation';
  END IF;
END;

CREATE TRIGGER `trg_chat_lock_states_cycle_match_insert`
BEFORE INSERT ON `chat_lock_states`
FOR EACH ROW
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM `chat_conversations` c
      JOIN `task_cycles` tc ON tc.`id` = NEW.`cycleId`
     WHERE c.`id` = NEW.`conversationId`
       AND tc.`taskId` = c.`taskId`
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Lock state cycle must belong to the same task as the conversation';
  END IF;
END;

CREATE TRIGGER `trg_chat_lock_states_cycle_match_update`
BEFORE UPDATE ON `chat_lock_states`
FOR EACH ROW
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM `chat_conversations` c
      JOIN `task_cycles` tc ON tc.`id` = NEW.`cycleId`
     WHERE c.`id` = NEW.`conversationId`
       AND tc.`taskId` = c.`taskId`
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Lock state cycle must belong to the same task as the conversation';
  END IF;
END;

CREATE TRIGGER `trg_chat_lock_events_cycle_match_insert`
BEFORE INSERT ON `chat_lock_events`
FOR EACH ROW
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM `chat_conversations` c
      JOIN `task_cycles` tc ON tc.`id` = NEW.`cycleId`
     WHERE c.`id` = NEW.`conversationId`
       AND tc.`taskId` = c.`taskId`
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Lock event cycle must belong to the same task as the conversation';
  END IF;

  IF NEW.`requestId` IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
        FROM `task_requests` tr
       WHERE tr.`id` = NEW.`requestId`
         AND tr.`cycleId` = NEW.`cycleId`
    ) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Lock event request must belong to the referenced task cycle';
    END IF;
  END IF;
END;

-- 4. Coerência de Recibos de Leitura Formal (lastReadSequence e Monotonia)
CREATE TRIGGER `trg_chat_read_receipts_sequence_match_insert`
BEFORE INSERT ON `chat_read_receipts`
FOR EACH ROW
BEGIN
  IF NEW.`lastReadMessageId` IS NULL THEN
    IF NEW.`lastReadSequence` <> 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Initial read receipt sequence must be 0 when lastReadMessageId is null';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1
        FROM `chat_messages` m
       WHERE m.`id` = NEW.`lastReadMessageId`
         AND m.`conversationId` = NEW.`conversationId`
         AND m.`sequenceNumber` = NEW.`lastReadSequence`
    ) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'lastReadSequence must match the referenced message sequenceNumber';
    END IF;
  END IF;
END;

CREATE TRIGGER `trg_chat_read_receipts_sequence_match_update`
BEFORE UPDATE ON `chat_read_receipts`
FOR EACH ROW
BEGIN
  IF NEW.`lastReadSequence` < OLD.`lastReadSequence` THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Read sequence pointer cannot regress';
  END IF;

  IF NEW.`lastReadMessageId` IS NULL THEN
    IF NEW.`lastReadSequence` <> 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Read receipt sequence must be 0 when lastReadMessageId is null';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1
        FROM `chat_messages` m
       WHERE m.`id` = NEW.`lastReadMessageId`
         AND m.`conversationId` = NEW.`conversationId`
         AND m.`sequenceNumber` = NEW.`lastReadSequence`
    ) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'lastReadSequence must match the referenced message sequenceNumber';
    END IF;
  END IF;
END;

-- 5. Coerência de Recibos de Leitura Funcional (lastReadSequence e Monotonia)
CREATE TRIGGER `trg_chat_functional_read_sequence_match_insert`
BEFORE INSERT ON `chat_functional_read_states`
FOR EACH ROW
BEGIN
  IF NEW.`lastReadMessageId` IS NULL THEN
    IF NEW.`lastReadSequence` <> 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Initial functional read sequence must be 0 when lastReadMessageId is null';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1
        FROM `chat_messages` m
       WHERE m.`id` = NEW.`lastReadMessageId`
         AND m.`conversationId` = NEW.`conversationId`
         AND m.`sequenceNumber` = NEW.`lastReadSequence`
    ) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Functional lastReadSequence must match referenced message sequenceNumber';
    END IF;
  END IF;
END;

CREATE TRIGGER `trg_chat_functional_read_sequence_match_update`
BEFORE UPDATE ON `chat_functional_read_states`
FOR EACH ROW
BEGIN
  IF NEW.`lastReadSequence` < OLD.`lastReadSequence` THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Functional read sequence pointer cannot regress';
  END IF;

  IF NEW.`lastReadMessageId` IS NULL THEN
    IF NEW.`lastReadSequence` <> 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Functional read sequence must be 0 when lastReadMessageId is null';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1
        FROM `chat_messages` m
       WHERE m.`id` = NEW.`lastReadMessageId`
         AND m.`conversationId` = NEW.`conversationId`
         AND m.`sequenceNumber` = NEW.`lastReadSequence`
    ) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Functional lastReadSequence must match referenced message sequenceNumber';
    END IF;
  END IF;
END;

-- 6. Trigger de inserção e integridade inicial de mensagens
CREATE TRIGGER `trg_chat_messages_initial_state_insert`
BEFORE INSERT ON `chat_messages`
FOR EACH ROW
BEGIN
  IF NEW.`status` NOT IN ('PENDING', 'PUBLISHED') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Initial message status must be PENDING or PUBLISHED';
  END IF;

  IF NEW.`status` = 'PENDING' THEN
    IF NEW.`publishedAt` IS NOT NULL OR NEW.`failureReason` IS NOT NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Pending message cannot have publishedAt or failureReason';
    END IF;
  END IF;

  IF NEW.`status` = 'PUBLISHED' THEN
    IF NEW.`publishedAt` IS NULL OR NEW.`publishedAt` < NEW.`createdAt` OR NEW.`failureReason` IS NOT NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Published message requires valid publishedAt and null failureReason';
    END IF;
    IF NEW.`reconciliationClaimToken` IS NOT NULL OR NEW.`reconciliationClaimExpiresAt` IS NOT NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Published message cannot have active reconciliation claim';
    END IF;
  END IF;
END;

-- 7. Trigger de imutabilidade, transição controlada e proteção operacional de mensagens
CREATE TRIGGER `trg_chat_messages_immutable_update`
BEFORE UPDATE ON `chat_messages`
FOR EACH ROW
BEGIN
  -- Mensagens em estado terminal (PUBLISHED ou FAILED) não aceitam nenhuma atualização
  IF OLD.`status` IN ('PUBLISHED', 'FAILED') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Terminal chat messages are strictly immutable';
  END IF;

  -- Mensagens em PENDING:
  IF OLD.`status` = 'PENDING' THEN
    IF NEW.`status` NOT IN ('PENDING', 'PUBLISHED', 'FAILED') THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid status transition for pending message';
    END IF;

    -- Garante imutabilidade estrita do payload central (usa <=> para comparação segura de nulos em content)
    IF NEW.`id` <> OLD.`id`
       OR NEW.`conversationId` <> OLD.`conversationId`
       OR NEW.`cycleId` <> OLD.`cycleId`
       OR NEW.`authorId` <> OLD.`authorId`
       OR NEW.`sequenceNumber` <> OLD.`sequenceNumber`
       OR NEW.`clientMessageId` <> OLD.`clientMessageId`
       OR NOT (NEW.`content` <=> OLD.`content`)
       OR NEW.`createdAt` <> OLD.`createdAt` THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Core message payload cannot be modified';
    END IF;

    -- Enquanto permanece em PENDING (atualização estritamente operacional do worker):
    IF NEW.`status` = 'PENDING' THEN
      IF NEW.`publishedAt` IS NOT NULL OR NEW.`failureReason` IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Pending message cannot set publishedAt or failureReason';
      END IF;

      -- Consistência do lease de reconciliação
      IF NEW.`reconciliationClaimToken` IS NOT NULL THEN
        IF NEW.`reconciliationClaimExpiresAt` IS NULL OR NEW.`reconciliationClaimExpiresAt` < COALESCE(NEW.`reconciliationClaimedAt`, NOW(3)) THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Active reconciliation claim requires valid future expiration';
        END IF;
      END IF;

      IF NEW.`reconciliationAttempts` < OLD.`reconciliationAttempts` THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'reconciliationAttempts counter cannot decrease';
      END IF;
    END IF;

    -- Validação de consistência ao transicionar para PUBLISHED
    IF NEW.`status` = 'PUBLISHED' THEN
      IF NEW.`publishedAt` IS NULL OR NEW.`publishedAt` < OLD.`createdAt` OR NEW.`failureReason` IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Published message requires valid publishedAt and null failureReason';
      END IF;
      IF NEW.`reconciliationClaimToken` IS NOT NULL OR NEW.`reconciliationClaimExpiresAt` IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Published message cannot retain active reconciliation claim';
      END IF;
    END IF;

    -- Validação de consistência ao transicionar para FAILED
    IF NEW.`status` = 'FAILED' THEN
      IF NEW.`failureReason` IS NULL OR NEW.`publishedAt` IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Failed message requires failureReason and null publishedAt';
      END IF;
      IF NEW.`reconciliationClaimToken` IS NOT NULL OR NEW.`reconciliationClaimExpiresAt` IS NOT NULL THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Failed message cannot retain active reconciliation claim';
      END IF;
    END IF;
  END IF;
END;

-- 8. Triggers de integridade de períodos de participação (não-sobreposição e intervalos coerentes)
CREATE TRIGGER `trg_chat_participation_periods_integrity_insert`
BEFORE INSERT ON `chat_participation_periods`
FOR EACH ROW
BEGIN
  IF NEW.`endedAt` IS NOT NULL AND NEW.`endedAt` < NEW.`joinedAt` THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'endedAt cannot be earlier than joinedAt';
  END IF;

  IF (NEW.`endedAt` IS NOT NULL AND NEW.`endReason` IS NULL)
     OR (NEW.`endedAt` IS NULL AND NEW.`endReason` IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'endedAt and endReason must be both null or both provided';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM `chat_participation_periods` p
     WHERE p.`participantId` = NEW.`participantId`
       AND p.`joinedAt` < COALESCE(NEW.`endedAt`, '9999-12-31 23:59:59.999')
       AND COALESCE(p.`endedAt`, '9999-12-31 23:59:59.999') > NEW.`joinedAt`
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Participation periods for the same participant cannot overlap';
  END IF;
END;

CREATE TRIGGER `trg_chat_participation_periods_integrity_update`
BEFORE UPDATE ON `chat_participation_periods`
FOR EACH ROW
BEGIN
  IF OLD.`endedAt` IS NOT NULL THEN
    IF NEW.`joinedAt` <> OLD.`joinedAt`
       OR NEW.`endedAt` <> OLD.`endedAt`
       OR NEW.`endReason` <> OLD.`endReason` THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Closed participation periods are immutable';
    END IF;
  END IF;

  IF NEW.`endedAt` IS NOT NULL AND NEW.`endedAt` < NEW.`joinedAt` THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'endedAt cannot be earlier than joinedAt';
  END IF;

  IF (NEW.`endedAt` IS NOT NULL AND NEW.`endReason` IS NULL)
     OR (NEW.`endedAt` IS NULL AND NEW.`endReason` IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'endedAt and endReason must be both null or both provided';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM `chat_participation_periods` p
     WHERE p.`participantId` = NEW.`participantId`
       AND p.`id` <> NEW.`id`
       AND p.`joinedAt` < COALESCE(NEW.`endedAt`, '9999-12-31 23:59:59.999')
       AND COALESCE(p.`endedAt`, '9999-12-31 23:59:59.999') > NEW.`joinedAt`
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Participation periods for the same participant cannot overlap';
  END IF;
END;

-- 9. Triggers de proibição incondicional de exclusão física
CREATE TRIGGER `trg_chat_participation_periods_no_delete`
BEFORE DELETE ON `chat_participation_periods`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Participation history cannot be deleted';
END;

CREATE TRIGGER `trg_chat_messages_no_delete`
BEFORE DELETE ON `chat_messages`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Chat messages cannot be deleted';
END;

CREATE TRIGGER `trg_chat_attachments_no_update`
BEFORE UPDATE ON `chat_message_attachments`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Chat message attachments are strictly immutable';
END;

CREATE TRIGGER `trg_chat_attachments_no_delete`
BEFORE DELETE ON `chat_message_attachments`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Chat message attachments cannot be deleted';
END;

CREATE TRIGGER `trg_chat_lock_events_no_update`
BEFORE UPDATE ON `chat_lock_events`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Chat lock events are append-only';
END;

CREATE TRIGGER `trg_chat_lock_events_no_delete`
BEFORE DELETE ON `chat_lock_events`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Chat lock events are append-only';
END;
