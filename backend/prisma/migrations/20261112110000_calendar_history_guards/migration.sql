-- Calendar drafts may overlap. Only published versions define effective history.
DROP TRIGGER IF EXISTS `trg_calendar_versions_no_overlap_insert`;
DROP TRIGGER IF EXISTS `trg_calendar_versions_no_overlap_update`;

CREATE TRIGGER `trg_calendar_versions_no_overlap_insert`
BEFORE INSERT ON `calendar_versions`
FOR EACH ROW
BEGIN
  IF NEW.`publishedAt` IS NOT NULL AND EXISTS (
    SELECT 1 FROM `calendar_versions` AS existing_version
     WHERE existing_version.`calendarId` = NEW.`calendarId`
       AND existing_version.`publishedAt` IS NOT NULL
       AND existing_version.`effectiveFrom` < COALESCE(NEW.`effectiveTo`, '9999-12-31 23:59:59.999')
       AND COALESCE(existing_version.`effectiveTo`, '9999-12-31 23:59:59.999') > NEW.`effectiveFrom`
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published calendar version periods cannot overlap';
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

  IF NEW.`publishedAt` IS NOT NULL AND EXISTS (
    SELECT 1 FROM `calendar_versions` AS existing_version
     WHERE existing_version.`calendarId` = NEW.`calendarId`
       AND existing_version.`id` <> NEW.`id`
       AND existing_version.`publishedAt` IS NOT NULL
       AND existing_version.`effectiveFrom` < COALESCE(NEW.`effectiveTo`, '9999-12-31 23:59:59.999')
       AND COALESCE(existing_version.`effectiveTo`, '9999-12-31 23:59:59.999') > NEW.`effectiveFrom`
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published calendar version periods cannot overlap';
  END IF;
END;

CREATE TRIGGER `trg_calendar_versions_history_no_delete`
BEFORE DELETE ON `calendar_versions`
FOR EACH ROW
BEGIN
  IF OLD.`publishedAt` IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published calendar versions cannot be deleted';
  END IF;
END;

-- Weekly schedules are editable only while their version is a draft.
DROP TRIGGER IF EXISTS `trg_work_schedules_no_overlap_insert`;
DROP TRIGGER IF EXISTS `trg_work_schedules_no_overlap_update`;

CREATE TRIGGER `trg_work_schedules_no_overlap_insert`
BEFORE INSERT ON `work_schedules`
FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM `calendar_versions` WHERE `id` = NEW.`calendarVersionId` AND `publishedAt` IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published calendar schedules are immutable';
  END IF;
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
  IF EXISTS (SELECT 1 FROM `calendar_versions` WHERE `id` = OLD.`calendarVersionId` AND `publishedAt` IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published calendar schedules are immutable';
  END IF;
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

CREATE TRIGGER `trg_work_schedules_history_no_delete`
BEFORE DELETE ON `work_schedules`
FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM `calendar_versions` WHERE `id` = OLD.`calendarVersionId` AND `publishedAt` IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published calendar schedules are immutable';
  END IF;
END;

-- One holiday per local date. A holiday wins over all exceptional working periods.
ALTER TABLE `calendar_exceptions`
  ADD COLUMN `holidayDateKey` DATE
    GENERATED ALWAYS AS (CASE WHEN `type` = 'HOLIDAY' THEN `localDate` ELSE NULL END) STORED,
  ADD UNIQUE INDEX `calendar_exceptions_one_holiday_key` (`calendarVersionId`, `holidayDateKey`);

CREATE TRIGGER `trg_calendar_exceptions_validate_insert`
BEFORE INSERT ON `calendar_exceptions`
FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM `calendar_versions` WHERE `id` = NEW.`calendarVersionId` AND `publishedAt` IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published calendar exceptions are immutable';
  END IF;
  IF NEW.`type` = 'WORKING_PERIOD' AND EXISTS (
    SELECT 1 FROM `calendar_exceptions` AS existing_exception
     WHERE existing_exception.`calendarVersionId` = NEW.`calendarVersionId`
       AND existing_exception.`localDate` = NEW.`localDate`
       AND existing_exception.`type` = 'WORKING_PERIOD'
       AND existing_exception.`startMinute` < NEW.`endMinute`
       AND existing_exception.`endMinute` > NEW.`startMinute`
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Calendar exceptional working periods cannot overlap';
  END IF;
END;

CREATE TRIGGER `trg_calendar_exceptions_validate_update`
BEFORE UPDATE ON `calendar_exceptions`
FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM `calendar_versions` WHERE `id` = OLD.`calendarVersionId` AND `publishedAt` IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published calendar exceptions are immutable';
  END IF;
  IF NEW.`type` = 'WORKING_PERIOD' AND EXISTS (
    SELECT 1 FROM `calendar_exceptions` AS existing_exception
     WHERE existing_exception.`calendarVersionId` = NEW.`calendarVersionId`
       AND existing_exception.`localDate` = NEW.`localDate`
       AND existing_exception.`id` <> NEW.`id`
       AND existing_exception.`type` = 'WORKING_PERIOD'
       AND existing_exception.`startMinute` < NEW.`endMinute`
       AND existing_exception.`endMinute` > NEW.`startMinute`
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Calendar exceptional working periods cannot overlap';
  END IF;
END;

CREATE TRIGGER `trg_calendar_exceptions_history_no_delete`
BEFORE DELETE ON `calendar_exceptions`
FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM `calendar_versions` WHERE `id` = OLD.`calendarVersionId` AND `publishedAt` IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published calendar exceptions are immutable';
  END IF;
END;
