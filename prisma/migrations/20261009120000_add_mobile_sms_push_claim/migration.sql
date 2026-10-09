CREATE TABLE "MobileSmsPushClaim" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileSmsPushClaim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MobileSmsPushClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MobileSmsPushClaim_userId_fingerprint_key"
  ON "MobileSmsPushClaim"("userId", "fingerprint");
CREATE INDEX "MobileSmsPushClaim_expiresAt_idx"
  ON "MobileSmsPushClaim"("expiresAt");
