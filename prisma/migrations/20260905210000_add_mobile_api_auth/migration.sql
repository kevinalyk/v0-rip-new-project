-- Mobile API auth foundation (app/api/mobile/v1, lib/mobile-auth.ts).
-- Entirely additive: two new tables plus a new FK from MobileRefreshToken to User.
-- Does not touch any existing table, column, or index.

-- Rotating, hashed refresh-token sessions for the mobile app.
CREATE TABLE "MobileRefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "tokenFamilyId" TEXT NOT NULL,
    "deviceId" TEXT,
    "deviceName" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileRefreshToken_refreshTokenHash_key" ON "MobileRefreshToken"("refreshTokenHash");
CREATE INDEX "MobileRefreshToken_userId_idx" ON "MobileRefreshToken"("userId");
CREATE INDEX "MobileRefreshToken_tokenFamilyId_idx" ON "MobileRefreshToken"("tokenFamilyId");
CREATE INDEX "MobileRefreshToken_expiresAt_idx" ON "MobileRefreshToken"("expiresAt");

ALTER TABLE "MobileRefreshToken"
  ADD CONSTRAINT "MobileRefreshToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Postgres-backed fixed-window rate limiter for mobile login/refresh. Only ever
-- stores an HMAC of the rate-limit identifier (see lib/mobile-auth.ts), never a
-- raw IP address, email address, password, or token.
CREATE TABLE "MobileAuthAttempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobileAuthAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileAuthAttempt_key_windowStart_key" ON "MobileAuthAttempt"("key", "windowStart");
CREATE INDEX "MobileAuthAttempt_windowStart_idx" ON "MobileAuthAttempt"("windowStart");
