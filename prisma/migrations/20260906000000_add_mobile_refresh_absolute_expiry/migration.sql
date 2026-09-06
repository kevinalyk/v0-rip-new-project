-- Adds a true absolute (non-extendable) expiry to mobile refresh-token families.
-- Follow-up to 20260905210000_add_mobile_api_auth — additive only, no existing
-- column/table is altered or dropped.
--
-- Previously, `expiresAt` was pushed to `now + 30d` on every rotation, so a
-- refresh token that kept getting used could extend a session indefinitely.
-- `absoluteExpiresAt` is set once at family creation (issueMobileSession) and
-- copied unchanged by every subsequent rotation (rotateMobileSession), so no
-- mobile session can ever live longer than 30 days from its original login,
-- no matter how often it is refreshed.

-- Backfill existing rows (none expected outside of this dev database) using
-- their own `expiresAt` as a safe upper bound before making the column
-- required.
ALTER TABLE "MobileRefreshToken" ADD COLUMN "absoluteExpiresAt" TIMESTAMP(3);
UPDATE "MobileRefreshToken" SET "absoluteExpiresAt" = "expiresAt" WHERE "absoluteExpiresAt" IS NULL;
ALTER TABLE "MobileRefreshToken" ALTER COLUMN "absoluteExpiresAt" SET NOT NULL;

CREATE INDEX "MobileRefreshToken_absoluteExpiresAt_idx" ON "MobileRefreshToken"("absoluteExpiresAt");
