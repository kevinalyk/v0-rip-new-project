-- Add separate subscription ID field for CI add-on
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "stripeCiSubscriptionId" TEXT;

-- Add unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "Client_stripeCiSubscriptionId_key" 
ON "Client"("stripeCiSubscriptionId");

-- Add comment
COMMENT ON COLUMN "Client"."stripeCiSubscriptionId" IS 'Stripe subscription ID for Competitive Insights add-on (separate from base plan subscription)';
