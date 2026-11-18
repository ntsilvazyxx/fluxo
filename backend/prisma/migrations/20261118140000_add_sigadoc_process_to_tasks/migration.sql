-- AlterTable: Add sigadocProcessNumber and sigadocProcessLink to tasks
ALTER TABLE `tasks`
  ADD COLUMN `sigadocProcessNumber` VARCHAR(128) NULL,
  ADD COLUMN `sigadocProcessLink` VARCHAR(2048) NULL;
