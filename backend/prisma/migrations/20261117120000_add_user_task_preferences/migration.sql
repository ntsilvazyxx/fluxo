-- Migration: Add user_task_preferences for Kanban card color personalization
CREATE TABLE `user_task_preferences` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `taskId` CHAR(36) NOT NULL,
  `color` VARCHAR(30) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `user_task_preferences_userId_taskId_key` (`userId`, `taskId`),
  INDEX `user_task_preferences_userId_idx` (`userId`),
  INDEX `user_task_preferences_taskId_idx` (`taskId`),
  CONSTRAINT `user_task_preferences_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `user_task_preferences_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
