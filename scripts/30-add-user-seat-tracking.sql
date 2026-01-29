-- Add user seat tracking for Professional plan
ALTER TABLE "Client" 
ADD COLUMN "userSeatsIncluded" INTEGER DEFAULT 3,
ADD COLUMN "additionalUserSeats" INTEGER DEFAULT 0,
ADD COLUMN "stripeUserSeatPriceId" TEXT;

-- Update existing clients to have correct defaults
UPDATE "Client" SET "userSeatsIncluded" = 3 WHERE "subscriptionPlan" = 'all';
UPDATE "Client" SET "userSeatsIncluded" = 1 WHERE "subscriptionPlan" IN ('free', 'paid', 'basic_inboxing');
UPDATE "Client" SET "userSeatsIncluded" = 999 WHERE "subscriptionPlan" = 'enterprise';

COMMENT ON COLUMN "Client"."userSeatsIncluded" IS 'Base number of users included in the plan (Professional: 3)';
COMMENT ON COLUMN "Client"."additionalUserSeats" IS 'Number of additional user seats purchased at $50/month each';
COMMENT ON COLUMN "Client"."stripeUserSeatPriceId" IS 'Stripe price ID for additional user seats';
