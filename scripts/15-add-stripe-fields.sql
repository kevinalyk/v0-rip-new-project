-- Add Stripe integration fields to Client table

ALTER TABLE "Client" 
ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT,
ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;

-- Add unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "Client_stripeCustomerId_key" ON "Client"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "Client_stripeSubscriptionId_key" ON "Client"("stripeSubscriptionId");
