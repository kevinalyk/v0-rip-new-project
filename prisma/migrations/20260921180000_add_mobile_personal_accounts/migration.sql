ALTER TABLE "User"
  ADD COLUMN "webOnboardingCompletedAt" TIMESTAMP(3),
  ADD COLUMN "mobileSubscriptionPlan" TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN "mobileSubscriptionStatus" TEXT NOT NULL DEFAULT 'inactive',
  ADD COLUMN "mobileSubscriptionExpiresAt" TIMESTAMP(3),
  ADD COLUMN "mobileSubscriptionUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "appleOriginalTransactionId" TEXT,
  ADD COLUMN "appleProductId" TEXT,
  ADD COLUMN "appleSubscriptionEnvironment" TEXT;

ALTER TABLE "Client"
  ADD COLUMN "accountKind" TEXT NOT NULL DEFAULT 'organization';

-- Every account that predates native mobile signup has already completed the
-- existing web account flow. Mobile-created users intentionally remain null
-- until they confirm their free web workspace on first web sign-in.
UPDATE "User"
SET "webOnboardingCompletedAt" = "createdAt"
WHERE "signupSource" <> 'ios';

ALTER TABLE "User"
  ADD CONSTRAINT "User_mobileSubscriptionPlan_check"
    CHECK ("mobileSubscriptionPlan" IN ('free', 'personal')),
  ADD CONSTRAINT "User_mobileSubscriptionStatus_check"
    CHECK ("mobileSubscriptionStatus" IN ('inactive', 'active', 'grace_period', 'billing_retry', 'expired', 'revoked')),
  ADD CONSTRAINT "User_appleSubscriptionEnvironment_check"
    CHECK ("appleSubscriptionEnvironment" IS NULL OR "appleSubscriptionEnvironment" IN ('sandbox', 'production'));

ALTER TABLE "Client"
  ADD CONSTRAINT "Client_accountKind_check"
    CHECK ("accountKind" IN ('personal', 'organization'));

CREATE UNIQUE INDEX "User_appleOriginalTransactionId_key"
  ON "User"("appleOriginalTransactionId");

CREATE INDEX "User_signupSource_webOnboardingCompletedAt_idx"
  ON "User"("signupSource", "webOnboardingCompletedAt");

CREATE INDEX "Client_accountKind_idx"
  ON "Client"("accountKind");

CREATE TABLE "ClientJoinInvitation" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "targetClientId" TEXT NOT NULL,
  "invitedRole" TEXT NOT NULL,
  "invitedByUserId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientJoinInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientJoinInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClientJoinInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClientJoinInvitation_targetClientId_fkey" FOREIGN KEY ("targetClientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ClientJoinInvitation_tokenHash_key" ON "ClientJoinInvitation"("tokenHash");
CREATE INDEX "ClientJoinInvitation_userId_acceptedAt_idx" ON "ClientJoinInvitation"("userId", "acceptedAt");
CREATE INDEX "ClientJoinInvitation_targetClientId_acceptedAt_idx" ON "ClientJoinInvitation"("targetClientId", "acceptedAt");
CREATE INDEX "ClientJoinInvitation_expiresAt_idx" ON "ClientJoinInvitation"("expiresAt");
