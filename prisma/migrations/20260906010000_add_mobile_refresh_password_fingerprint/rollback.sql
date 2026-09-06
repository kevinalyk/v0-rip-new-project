-- Rollback for 20260906010000_add_mobile_refresh_password_fingerprint. Not applied
-- automatically — run manually only if this migration needs to be reverted. Rolling
-- this back re-opens the "password reset doesn't fully revoke old sessions" gap that
-- this migration closed, so only do so alongside reverting the corresponding
-- lib/mobile-auth.ts changes.

ALTER TABLE "MobileRefreshToken" DROP COLUMN IF EXISTS "issuedPasswordFingerprint";
