-- Setup first paying client with custom subscription
-- Client: [YOUR_CLIENT_NAME]
-- Deal: $500/month for Professional tier (normally $300) with 9 seats
-- Instructions:
-- 1. Replace [YOUR_CLIENT_NAME] with the actual client name
-- 2. Replace [YOUR_CLIENT_SLUG] with the client slug (lowercase, no spaces)
-- 3. After creating the subscription in Stripe, replace the placeholder IDs below

-- Step 1: Find your client ID (uncomment to check):
-- SELECT id, name, slug FROM "Client" WHERE slug = '[YOUR_CLIENT_SLUG]';

-- Step 2: Update the client with Stripe and subscription details
UPDATE "Client" SET
  -- Stripe IDs (GET THESE FROM STRIPE DASHBOARD)
  "stripeCustomerId" = 'cus_XXXXXXXXXXXXX',              -- Customer ID from Stripe
  "stripeSubscriptionId" = 'sub_XXXXXXXXXXXXX',          -- Main subscription ID
  "stripeSubscriptionItemId" = 'si_XXXXXXXXXXXXX',       -- Main subscription item ID
  "stripeCiSubscriptionItemId" = 'si_XXXXXXXXXXXXX',     -- CI subscription item ID (same as above for all plan)
  "stripeUserSeatsItemId" = NULL,                        -- No separate user seats item for custom deal
  
  -- Subscription Details
  "subscriptionPlan" = 'all',                            -- 'all' = Professional tier
  "subscriptionStatus" = 'active',
  "hasCompetitiveInsights" = true,                       -- CI included in Professional
  
  -- Email Volume
  "emailVolumeLimit" = 20000,                            -- 20k emails/month for Professional
  "emailVolumeUsed" = 0,
  
  -- User Seats (9 total = 3 included + 6 additional)
  "userSeatsIncluded" = 3,                               -- Professional includes 3 seats
  "additionalUserSeats" = 6,                             -- 6 additional seats
  "totalUsers" = 9,                                      -- Total seats being used
  
  -- Subscription Timing
  "subscriptionStartDate" = NOW(),
  "subscriptionRenewDate" = NOW() + INTERVAL '1 month',
  "lastUsageReset" = NOW(),
  
  -- Misc
  "cancelAtPeriodEnd" = false,
  "updatedAt" = NOW()

WHERE slug = '[YOUR_CLIENT_SLUG]';

-- Step 3: Verify the update
SELECT 
  name,
  slug,
  "stripeCustomerId",
  "stripeSubscriptionId",
  "subscriptionPlan",
  "subscriptionStatus",
  "hasCompetitiveInsights",
  "additionalUserSeats",
  "totalUsers",
  "emailVolumeLimit"
FROM "Client" 
WHERE slug = '[YOUR_CLIENT_SLUG]';

-- NOTES:
-- The custom $500/month price lives in Stripe only
-- Your database just tracks that they're on the "all" (Professional) plan
-- In Stripe, create the subscription with product name "Professional" at $500/month
-- The webhook will see "Professional" and map it to plan "all" automatically
