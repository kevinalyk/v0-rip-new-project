-- Add stripeUserSeatsItemId column to Client table for tracking additional user seat subscription items
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "stripeUserSeatsItemId" TEXT;

-- Add unique constraint
ALTER TABLE "Client" ADD CONSTRAINT "Client_stripeUserSeatsItemId_key" UNIQUE ("stripeUserSeatsItemId");
