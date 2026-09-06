-- Rollback for 20260906000000_add_mobile_refresh_absolute_expiry. Not applied
-- automatically — run manually only if this migration needs to be reverted.
-- Safe to run even if application code has not been rolled back yet: code that
-- reads/writes `absoluteExpiresAt` would simply start failing on that column.

DROP INDEX IF EXISTS "MobileRefreshToken_absoluteExpiresAt_idx";
ALTER TABLE "MobileRefreshToken" DROP COLUMN IF EXISTS "absoluteExpiresAt";
