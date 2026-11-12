ALTER TABLE `user_sessions` ADD COLUMN `mfaVerifiedAt` DATETIME(3) NULL;
CREATE TABLE `auth_challenges` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `userVersion` INTEGER UNSIGNED NOT NULL,
  `enrollmentSecret` TEXT NULL,
  `attempts` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `auth_challenges_tokenHash_key` (`tokenHash`),
  INDEX `auth_challenges_userId_expiresAt_idx` (`userId`, `expiresAt`),
  CONSTRAINT `auth_challenges_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
