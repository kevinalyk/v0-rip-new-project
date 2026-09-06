-- Adds a password-change fingerprint to mobile refresh-token rows. Follow-up to
-- 20260906000000_add_mobile_refresh_absolute_expiry — additive only.
--
-- Previously, a forced password reset (firstLogin=true) only blocked a session while
-- firstLogin stayed true. Once the user completed the reset (firstLogin cleared back
-- to false), any pre-reset access token still inside its 15-minute TTL, or an unused
-- pre-reset refresh-token family, became usable again — a real password change never
-- permanently invalidated prior mobile sessions.
--
-- `issuedPasswordFingerprint` stores sha256(password hash) at the time each refresh
-- row was issued or rotated. Both requireMobileAuth (access tokens carry the same
-- fingerprint as a JWT claim) and rotateMobileSession compare this against the user's
-- *current* password hash on every call, independent of firstLogin. Any real password
-- change (self-service reset, admin-forced reset, or a plain profile password update)
-- changes the password hash and therefore permanently invalidates every mobile session
-- issued before it.

-- Backfill: no rows are expected to exist outside of this dev database at migration
-- time, but for safety, seed any existing row with a fingerprint computed from its
-- owning user's *current* password so it does not spuriously break until next rotation.
ALTER TABLE "MobileRefreshToken" ADD COLUMN "issuedPasswordFingerprint" TEXT;

UPDATE "MobileRefreshToken" t
SET "issuedPasswordFingerprint" = substring(encode(sha256(convert_to(COALESCE(u."password", ''), 'UTF8')), 'hex') from 1 for 32)
FROM "User" u
WHERE u.id = t."userId" AND t."issuedPasswordFingerprint" IS NULL;

ALTER TABLE "MobileRefreshToken" ALTER COLUMN "issuedPasswordFingerprint" SET NOT NULL;
