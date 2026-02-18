-- Add subscription and billing fields to Client table
ALTER TABLE "Client" 
ADD COLUMN IF NOT EXISTS "subscriptionPlan" TEXT NOT NULL DEFAULT 'professional',
ADD COLUMN IF NOT EXISTS "hasCompetitiveInsights" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "emailVolumeLimit" INTEGER NOT NULL DEFAULT 20000,
ADD COLUMN IF NOT EXISTS "emailVolumeUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "subscriptionStartDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "subscriptionRenewDate" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastUsageReset" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Set all existing clients to Professional plan with no CI
UPDATE "Client"
SET 
  "subscriptionPlan" = 'professional',
  "hasCompetitiveInsights" = false,
  "emailVolumeLimit" = 20000,
  "emailVolumeUsed" = 0,
  "subscriptionStartDate" = CURRENT_TIMESTAMP,
  "subscriptionRenewDate" = CURRENT_TIMESTAMP + INTERVAL '1 month',
  "lastUsageReset" = CURRENT_TIMESTAMP;

-- Add index for faster queries on subscription plan
CREATE INDEX IF NOT EXISTS "Client_subscriptionPlan_idx" ON "Client"("subscriptionPlan");
CREATE INDEX IF NOT EXISTS "Client_hasCompetitiveInsights_idx" ON "Client"("hasCompetitiveInsights");
