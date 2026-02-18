-- Migration: Update Client table to use subscription item IDs
-- This changes the subscription architecture to properly track Stripe subscription items

-- Step 1: Add new column for base plan subscription item ID
ALTER TABLE "Client" 
ADD COLUMN IF NOT EXISTS "stripeSubscriptionItemId" TEXT;

-- Step 2: Rename CI subscription ID to CI subscription item ID
ALTER TABLE "Client" 
RENAME COLUMN "stripeCiSubscriptionId" TO "stripeCiSubscriptionItemId";

-- Step 3: Add comments for clarity
COMMENT ON COLUMN "Client"."stripeSubscriptionId" IS 'Main Stripe subscription ID (sub_xxx) - container for all items';
COMMENT ON COLUMN "Client"."stripeSubscriptionItemId" IS 'Stripe subscription item ID (si_xxx) for base plan (Pro/Enterprise)';
COMMENT ON COLUMN "Client"."stripeCiSubscriptionItemId" IS 'Stripe subscription item ID (si_xxx) for Competitive Insights add-on';

-- Step 4: Create index for faster lookups
CREATE INDEX IF NOT EXISTS "Client_stripeSubscriptionItemId_idx" ON "Client"("stripeSubscriptionItemId");
CREATE INDEX IF NOT EXISTS "Client_stripeCiSubscriptionItemId_idx" ON "Client"("stripeCiSubscriptionItemId");
