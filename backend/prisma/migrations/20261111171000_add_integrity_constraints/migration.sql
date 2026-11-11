-- MariaDB 10.11 constraints that are not representable in Prisma Schema Language.

-- Active-row uniqueness through generated nullable keys.
ALTER TABLE `team_members`
  ADD COLUMN `activeMembershipKey` VARCHAR(36)
    GENERATED ALWAYS AS (
      CASE WHEN `leftAt` IS NULL THEN RTRIM(`userId`) ELSE NULL END
    ) STORED,
  ADD UNIQUE INDEX `team_members_one_active_key` (`teamId`, `activeMembershipKey`);

ALTER TABLE `team_managers`
  ADD COLUMN `activeManagerKey` VARCHAR(36)
    GENERATED ALWAYS AS (
      CASE WHEN `endedAt` IS NULL THEN RTRIM(`userId`) ELSE NULL END
    ) STORED,
  ADD UNIQUE INDEX `team_managers_one_active_key` (`teamId`, `activeManagerKey`);

ALTER TABLE `task_cycles`
  ADD COLUMN `activeTaskKey` VARCHAR(36)
    GENERATED ALWAYS AS (
      CASE WHEN `closedAt` IS NULL THEN RTRIM(`taskId`) ELSE NULL END
    ) STORED,
  ADD UNIQUE INDEX `task_cycles_one_open_per_task_key` (`activeTaskKey`);

ALTER TABLE `task_assignments`
  ADD COLUMN `activeCycleKey` VARCHAR(36)
    GENERATED ALWAYS AS (
      CASE WHEN `endedAt` IS NULL THEN RTRIM(`cycleId`) ELSE NULL END
    ) STORED,
  ADD UNIQUE INDEX `task_assignments_one_current_per_cycle_key` (`activeCycleKey`);

ALTER TABLE `task_pause_intervals`
  ADD COLUMN `activeAssignmentKey` VARCHAR(36)
    GENERATED ALWAYS AS (
      CASE WHEN `endedAt` IS NULL THEN RTRIM(`assignmentId`) ELSE NULL END
    ) STORED,
  ADD UNIQUE INDEX `task_pauses_one_open_per_assignment_key` (`activeAssignmentKey`);

ALTER TABLE `task_requests`
  ADD COLUMN `pendingRequestKey` VARCHAR(36)
    GENERATED ALWAYS AS (
      CASE WHEN `status` = 'PENDING' THEN RTRIM(`assignmentId`) ELSE NULL END
    ) STORED,
  ADD UNIQUE INDEX `task_requests_one_pending_type_key` (`pendingRequestKey`, `type`);

-- Composite foreign keys keep redundant references inside the same aggregate.
ALTER TABLE `work_calendars`
  ADD UNIQUE INDEX `work_calendars_id_teamId_key` (`id`, `teamId`);

ALTER TABLE `task_requests`
  ADD UNIQUE INDEX `task_requests_id_assignmentId_key` (`id`, `assignmentId`),
  ADD CONSTRAINT `task_requests_assignment_cycle_fkey`
    FOREIGN KEY (`assignmentId`, `cycleId`)
    REFERENCES `task_assignments` (`id`, `cycleId`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `task_pause_intervals`
  ADD CONSTRAINT `task_pause_request_assignment_fkey`
    FOREIGN KEY (`requestId`, `assignmentId`)
    REFERENCES `task_requests` (`id`, `assignmentId`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `tasks`
  ADD CONSTRAINT `tasks_current_cycle_same_task_fkey`
    FOREIGN KEY (`currentCycleId`, `id`)
    REFERENCES `task_cycles` (`id`, `taskId`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `teams`
  ADD CONSTRAINT `teams_calendar_same_team_fkey`
    FOREIGN KEY (`calendarId`, `id`)
    REFERENCES `work_calendars` (`id`, `teamId`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `work_calendars`
  ADD CONSTRAINT `work_calendars_active_version_same_calendar_fkey`
    FOREIGN KEY (`activeVersionId`, `id`)
    REFERENCES `calendar_versions` (`id`, `calendarId`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Row-local invariants enforced by MySQL 8 CHECK constraints.
ALTER TABLE `users`
  ADD CONSTRAINT `users_email_normalized_chk`
    CHECK (`emailNormalized` = LOWER(TRIM(`emailNormalized`))),
  ADD CONSTRAINT `users_version_nonnegative_chk`
    CHECK (`version` >= 0);

ALTER TABLE `team_members`
  ADD CONSTRAINT `team_members_interval_chk`
    CHECK (`leftAt` IS NULL OR `leftAt` >= `joinedAt`);

ALTER TABLE `team_managers`
  ADD CONSTRAINT `team_managers_interval_chk`
    CHECK (`endedAt` IS NULL OR `endedAt` >= `assignedAt`);

ALTER TABLE `calendar_versions`
  ADD CONSTRAINT `calendar_versions_number_chk`
    CHECK (`versionNumber` >= 1),
  ADD CONSTRAINT `calendar_versions_interval_chk`
    CHECK (`effectiveTo` IS NULL OR `effectiveTo` > `effectiveFrom`);

ALTER TABLE `work_schedules`
  ADD CONSTRAINT `work_schedules_weekday_chk`
    CHECK (`weekday` BETWEEN 1 AND 7),
  ADD CONSTRAINT `work_schedules_minutes_chk`
    CHECK (`startMinute` < `endMinute` AND `endMinute` <= 1440);

ALTER TABLE `calendar_exceptions`
  ADD CONSTRAINT `calendar_exceptions_shape_chk`
    CHECK (
      (`type` = 'HOLIDAY' AND `startMinute` IS NULL AND `endMinute` IS NULL)
      OR
      (`type` = 'WORKING_PERIOD' AND `startMinute` IS NOT NULL AND `endMinute` IS NOT NULL
        AND `startMinute` < `endMinute` AND `endMinute` <= 1440)
    );

ALTER TABLE `task_cycles`
  ADD CONSTRAINT `task_cycles_number_chk`
    CHECK (`cycleNumber` >= 1),
  ADD CONSTRAINT `task_cycles_interval_chk`
    CHECK (`closedAt` IS NULL OR `closedAt` >= `openedAt`),
  ADD CONSTRAINT `task_cycles_terminal_state_chk`
    CHECK (
      (`status` IN ('PENDING', 'AWAITING_ACCEPTANCE', 'IN_PROGRESS') AND `closedAt` IS NULL)
      OR
      (`status` IN ('COMPLETED', 'CANCELLED') AND `closedAt` IS NOT NULL)
    ),
  ADD CONSTRAINT `task_cycles_completion_text_chk`
    CHECK (`status` <> 'COMPLETED' OR (`completionText` IS NOT NULL AND CHAR_LENGTH(TRIM(`completionText`)) > 0));

ALTER TABLE `task_assignments`
  ADD CONSTRAINT `task_assignments_acceptance_time_chk`
    CHECK (`acceptedAt` IS NULL OR `acceptedAt` >= `assignedAt`),
  ADD CONSTRAINT `task_assignments_end_time_chk`
    CHECK (`endedAt` IS NULL OR `endedAt` >= `assignedAt`),
  ADD CONSTRAINT `task_assignments_end_reason_chk`
    CHECK ((`endedAt` IS NULL AND `endReason` IS NULL) OR (`endedAt` IS NOT NULL AND `endReason` IS NOT NULL));

ALTER TABLE `task_requests`
  ADD CONSTRAINT `task_requests_proposal_shape_chk`
    CHECK (
      (`type` = 'RETURN' AND `proposedDeadlineAt` IS NULL)
      OR
      (`type` = 'EXTENSION' AND `proposedDeadlineAt` IS NOT NULL)
    ),
  ADD CONSTRAINT `task_requests_decision_time_chk`
    CHECK ((`status` = 'PENDING' AND `decidedAt` IS NULL) OR (`status` <> 'PENDING' AND `decidedAt` IS NOT NULL)),
  ADD CONSTRAINT `task_requests_denial_reason_chk`
    CHECK (`status` <> 'DENIED' OR (`decisionReason` IS NOT NULL AND CHAR_LENGTH(TRIM(`decisionReason`)) > 0));

ALTER TABLE `task_pause_intervals`
  ADD CONSTRAINT `task_pauses_interval_chk`
    CHECK (`endedAt` IS NULL OR `endedAt` >= `startedAt`);

ALTER TABLE `deadline_changes`
  ADD CONSTRAINT `deadline_changes_actual_change_chk`
    CHECK (`oldDeadlineAt` IS NULL OR `newDeadlineAt` <> `oldDeadlineAt`),
  ADD CONSTRAINT `deadline_changes_reason_chk`
    CHECK (CHAR_LENGTH(TRIM(`reason`)) > 0);

ALTER TABLE `task_images`
  ADD CONSTRAINT `task_images_mime_chk`
    CHECK (`mimeType` IN ('image/jpeg', 'image/png', 'image/webp')),
  ADD CONSTRAINT `task_images_size_chk`
    CHECK (`sizeBytes` > 0 AND `sizeBytes` <= 10485760);

ALTER TABLE `idempotency_keys`
  ADD CONSTRAINT `idempotency_response_status_chk`
    CHECK (`responseStatus` IS NULL OR `responseStatus` BETWEEN 100 AND 599),
  ADD CONSTRAINT `idempotency_expiry_chk`
    CHECK (`expiresAt` > `createdAt`);

ALTER TABLE `user_sessions`
  ADD CONSTRAINT `user_sessions_expiry_chk`
    CHECK (`expiresAt` > `createdAt`),
  ADD CONSTRAINT `user_sessions_revocation_chk`
    CHECK (`revokedAt` IS NULL OR `revokedAt` >= `createdAt`);

ALTER TABLE `password_reset_tokens`
  ADD CONSTRAINT `password_reset_expiry_chk`
    CHECK (`expiresAt` > `createdAt`),
  ADD CONSTRAINT `password_reset_used_chk`
    CHECK (`usedAt` IS NULL OR `usedAt` >= `createdAt`);

-- Cross-row and history invariants require triggers.
CREATE TRIGGER `trg_tasks_no_nested_subtask_insert`
BEFORE INSERT ON `tasks`
FOR EACH ROW
BEGIN
  IF NEW.`parentCycleId` IS NOT NULL AND EXISTS (
    SELECT 1
      FROM `task_cycles` AS parent_cycle
      JOIN `tasks` AS parent_task ON parent_task.`id` = parent_cycle.`taskId`
     WHERE parent_cycle.`id` = NEW.`parentCycleId`
       AND parent_task.`parentCycleId` IS NOT NULL
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A subtask cannot have its own subtask';
  END IF;
END;

CREATE TRIGGER `trg_tasks_no_nested_subtask_update`
BEFORE UPDATE ON `tasks`
FOR EACH ROW
BEGIN
  IF NEW.`parentCycleId` IS NOT NULL AND EXISTS (
    SELECT 1
      FROM `task_cycles` AS parent_cycle
      JOIN `tasks` AS parent_task ON parent_task.`id` = parent_cycle.`taskId`
     WHERE parent_cycle.`id` = NEW.`parentCycleId`
       AND parent_task.`parentCycleId` IS NOT NULL
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A subtask cannot have its own subtask';
  END IF;
END;

CREATE TRIGGER `trg_calendar_versions_no_overlap_insert`
BEFORE INSERT ON `calendar_versions`
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1 FROM `calendar_versions` AS existing_version
     WHERE existing_version.`calendarId` = NEW.`calendarId`
       AND existing_version.`effectiveFrom` < COALESCE(NEW.`effectiveTo`, '9999-12-31 23:59:59.999')
       AND COALESCE(existing_version.`effectiveTo`, '9999-12-31 23:59:59.999') > NEW.`effectiveFrom`
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Calendar version effective periods cannot overlap';
  END IF;
END;

CREATE TRIGGER `trg_calendar_versions_no_overlap_update`
BEFORE UPDATE ON `calendar_versions`
FOR EACH ROW
BEGIN
  IF OLD.`publishedAt` IS NOT NULL AND NOT (
    OLD.`effectiveTo` IS NULL
    AND NEW.`effectiveTo` IS NOT NULL
    AND NEW.`effectiveTo` > OLD.`effectiveFrom`
    AND NEW.`calendarId` = OLD.`calendarId`
    AND NEW.`versionNumber` = OLD.`versionNumber`
    AND NEW.`effectiveFrom` = OLD.`effectiveFrom`
    AND NEW.`publishedAt` = OLD.`publishedAt`
    AND NEW.`createdById` = OLD.`createdById`
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published calendar versions are immutable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM `calendar_versions` AS existing_version
     WHERE existing_version.`calendarId` = NEW.`calendarId`
       AND existing_version.`id` <> NEW.`id`
       AND existing_version.`effectiveFrom` < COALESCE(NEW.`effectiveTo`, '9999-12-31 23:59:59.999')
       AND COALESCE(existing_version.`effectiveTo`, '9999-12-31 23:59:59.999') > NEW.`effectiveFrom`
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Calendar version effective periods cannot overlap';
  END IF;
END;

CREATE TRIGGER `trg_work_schedules_no_overlap_insert`
BEFORE INSERT ON `work_schedules`
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1 FROM `work_schedules` AS existing_schedule
     WHERE existing_schedule.`calendarVersionId` = NEW.`calendarVersionId`
       AND existing_schedule.`weekday` = NEW.`weekday`
       AND existing_schedule.`startMinute` < NEW.`endMinute`
       AND existing_schedule.`endMinute` > NEW.`startMinute`
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Work schedule periods cannot overlap';
  END IF;
END;

CREATE TRIGGER `trg_work_schedules_no_overlap_update`
BEFORE UPDATE ON `work_schedules`
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1 FROM `work_schedules` AS existing_schedule
     WHERE existing_schedule.`calendarVersionId` = NEW.`calendarVersionId`
       AND existing_schedule.`weekday` = NEW.`weekday`
       AND existing_schedule.`id` <> NEW.`id`
       AND existing_schedule.`startMinute` < NEW.`endMinute`
       AND existing_schedule.`endMinute` > NEW.`startMinute`
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Work schedule periods cannot overlap';
  END IF;
END;

CREATE TRIGGER `trg_task_cycles_closed_immutable_update`
BEFORE UPDATE ON `task_cycles`
FOR EACH ROW
BEGIN
  IF OLD.`closedAt` IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Closed task cycles are immutable';
  END IF;
END;

CREATE TRIGGER `trg_task_cycles_history_no_delete`
BEFORE DELETE ON `task_cycles`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Task cycle history cannot be deleted';
END;

CREATE TRIGGER `trg_audit_events_append_only_update`
BEFORE UPDATE ON `audit_events`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit events are append-only';
END;

CREATE TRIGGER `trg_audit_events_append_only_delete`
BEFORE DELETE ON `audit_events`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit events are append-only';
END;

CREATE TRIGGER `trg_deadline_changes_append_only_update`
BEFORE UPDATE ON `deadline_changes`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Deadline changes are append-only';
END;

CREATE TRIGGER `trg_deadline_changes_append_only_delete`
BEFORE DELETE ON `deadline_changes`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Deadline changes are append-only';
END;

CREATE TRIGGER `trg_task_cycle_notes_append_only_update`
BEFORE UPDATE ON `task_cycle_notes`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Task cycle notes are append-only';
END;

CREATE TRIGGER `trg_task_cycle_notes_append_only_delete`
BEFORE DELETE ON `task_cycle_notes`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Task cycle notes are append-only';
END;
