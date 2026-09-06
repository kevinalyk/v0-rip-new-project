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
-- time, but for correctness this must fail closed. The migration has no way to know
-- which password was current when an older row was actually issued or rotated — only
-- the user's *current* password hash is available here. Backfilling the current
-- fingerprint into a pre-existing row would therefore silently "bless" it: if that
-- row's refresh token predates a password change made *after* it was issued but
-- *before* this migration runs, it would incorrectly pass the fingerprint check on
-- its next use instead of being invalidated by that password change like every other
-- session was.
--
-- So every row that predates this column is deliberately revoked here, on top of
-- being backfilled — legitimate active sessions must re-authenticate once. This is a
-- one-time, intentional sign-out of all existing mobile sessions when this migration
-- is deployed; it does not affect sessions created after deployment.
ALTER TABLE "MobileRefreshToken" ADD COLUMN "issuedPasswordFingerprint" TEXT;

UPDATE "MobileRefreshToken" t
SET "issuedPasswordFingerprint" = substring(encode(sha256(convert_to(COALESCE(u."password", ''), 'UTF8')), 'hex') from 1 for 32),
    "revokedAt" = COALESCE(t."revokedAt", now()),
    "revokedReason" = COALESCE(t."revokedReason", 'schema_upgrade')
FROM "User" u
WHERE u.id = t."userId" AND t."issuedPasswordFingerprint" IS NULL;

ALTER TABLE "MobileRefreshToken" ALTER COLUMN "issuedPasswordFingerprint" SET NOT NULL;
