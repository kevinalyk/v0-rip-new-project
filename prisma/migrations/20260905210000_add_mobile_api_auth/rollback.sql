-- Rollback for 20260905210000_add_mobile_api_auth. Not applied automatically —
-- run manually only if this migration needs to be reverted. Safe to run even if
-- application code referencing these tables has not been removed yet, since it
-- would simply start failing those specific mobile-only code paths.

ALTER TABLE "MobileRefreshToken" DROP CONSTRAINT IF EXISTS "MobileRefreshToken_userId_fkey";

DROP TABLE IF EXISTS "MobileRefreshToken";
DROP TABLE IF EXISTS "MobileAuthAttempt";
