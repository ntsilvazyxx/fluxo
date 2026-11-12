-- Compensatory migration: never edit 20261112233000_auth_mfa_sessions.
-- Preserve all encrypted secrets, recovery hashes, timestamps and foreign keys.
-- No credential disposal is authorized; these archives have no runtime use.
RENAME TABLE `auth_challenges` TO `legacy_mfa_auth_challenges`,
             `mfa_credentials` TO `legacy_mfa_credentials`;
ALTER TABLE `user_sessions`
  CHANGE COLUMN `mfaVerifiedAt` `legacyMfaVerifiedAt` DATETIME(3) NULL;
