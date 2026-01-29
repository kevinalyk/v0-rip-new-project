-- Add stripeCiSubscriptionId column to support separate CI subscriptions
-- This allows Pro and CI to be in separate subscriptions when bought separately

ALTER TABLE "Client" 
ADD COLUMN IF NOT EXISTS "stripeCiSubscriptionId" TEXT;

-- Add unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "Client_stripeCiSubscriptionId_key" 
ON "Client"("stripeCiSubscriptionId");

-- Add comment explaining the field
COMMENT ON COLUMN "Client"."stripeCiSubscriptionId" IS 'Separate Stripe subscription ID for CI add-on when bought separately from base plan';
