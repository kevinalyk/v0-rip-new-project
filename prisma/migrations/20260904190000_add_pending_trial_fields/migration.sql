-- Add pending-trial fields: signup stashes the redeemed TrialCode here until the required
-- Stripe checkout (with card) completes, at which point the webhook starts the actual trial
-- and clears these.
ALTER TABLE "Client" ADD COLUMN "pendingTrialCodeId" TEXT;
ALTER TABLE "Client" ADD COLUMN "pendingTrialLengthDays" INTEGER;
