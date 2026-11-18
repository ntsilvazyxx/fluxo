-- Migration: Add task_comments for task chat and activities
CREATE TABLE `task_comments` (
  `id` CHAR(36) NOT NULL,
  `taskId` CHAR(36) NOT NULL,
  `authorId` CHAR(36) NOT NULL,
  `content` TEXT NOT NULL,
  `clientMessageId` VARCHAR(64) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `task_comments_clientMessageId_key` (`clientMessageId`),
  INDEX `task_comments_taskId_createdAt_idx` (`taskId`, `createdAt`),
  INDEX `task_comments_authorId_idx` (`authorId`),
  CONSTRAINT `task_comments_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `task_comments_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

