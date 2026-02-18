-- Add subscriptionStatus field to Client table
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT NOT NULL DEFAULT 'active';

-- Update all existing clients to have 'active' status
UPDATE "Client" SET "subscriptionStatus" = 'active' WHERE "subscriptionStatus" IS NULL;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS "Client_subscriptionStatus_idx" ON "Client"("subscriptionStatus");
