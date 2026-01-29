-- Comprehensive migration to update subscription plans
-- This handles the transition from old plan values to new ones

BEGIN;

-- Step 1: Add a comment to document valid values for subscriptionPlan
COMMENT ON COLUMN "Client"."subscriptionPlan" IS 'Valid values: free, paid, all, basic_inboxing, enterprise';

-- Step 2: Update all existing clients to "free" plan (except RIP)
UPDATE "Client"
SET "subscriptionPlan" = 'free'
WHERE "subscriptionPlan" NOT IN ('free', 'paid', 'all', 'basic_inboxing', 'enterprise')
  AND "id" != 'rip';

-- Step 3: Ensure RIP stays on their current plan (or set to enterprise if needed)
-- If RIP doesn't have a valid plan, set to enterprise
UPDATE "Client"
SET "subscriptionPlan" = 'enterprise'
WHERE "id" = 'rip'
  AND "subscriptionPlan" NOT IN ('free', 'paid', 'all', 'basic_inboxing', 'enterprise');

-- Step 4: Add a CHECK constraint to enforce valid subscription plan values
-- First, drop the constraint if it already exists (in case re-running this script)
ALTER TABLE "Client" DROP CONSTRAINT IF EXISTS "Client_subscriptionPlan_check";

-- Add the constraint
ALTER TABLE "Client" 
ADD CONSTRAINT "Client_subscriptionPlan_check" 
CHECK ("subscriptionPlan" IN ('free', 'paid', 'all', 'basic_inboxing', 'enterprise'));

-- Step 5: Verify the migration
SELECT 
  "id",
  "name",
  "subscriptionPlan",
  "subscriptionStatus"
FROM "Client"
ORDER BY "subscriptionPlan", "name";

COMMIT;

-- If anything goes wrong, run: ROLLBACK;
