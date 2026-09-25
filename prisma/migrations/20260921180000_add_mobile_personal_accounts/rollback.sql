DROP TABLE IF EXISTS "ClientJoinInvitation";

DROP INDEX IF EXISTS "Client_accountKind_idx";
DROP INDEX IF EXISTS "User_signupSource_webOnboardingCompletedAt_idx";
DROP INDEX IF EXISTS "User_appleOriginalTransactionId_key";

ALTER TABLE "Client"
  DROP CONSTRAINT IF EXISTS "Client_accountKind_check",
  DROP COLUMN IF EXISTS "accountKind";

ALTER TABLE "User"
  DROP CONSTRAINT IF EXISTS "User_appleSubscriptionEnvironment_check",
  DROP CONSTRAINT IF EXISTS "User_mobileSubscriptionStatus_check",
  DROP CONSTRAINT IF EXISTS "User_mobileSubscriptionPlan_check",
  DROP COLUMN IF EXISTS "appleSubscriptionEnvironment",
  DROP COLUMN IF EXISTS "appleProductId",
  DROP COLUMN IF EXISTS "appleOriginalTransactionId",
  DROP COLUMN IF EXISTS "mobileSubscriptionUpdatedAt",
  DROP COLUMN IF EXISTS "mobileSubscriptionExpiresAt",
  DROP COLUMN IF EXISTS "mobileSubscriptionStatus",
  DROP COLUMN IF EXISTS "mobileSubscriptionPlan",
  DROP COLUMN IF EXISTS "webOnboardingCompletedAt";
