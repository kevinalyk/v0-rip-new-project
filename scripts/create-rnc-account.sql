-- Create RNC Enterprise Demo Account
-- Client: RNC (Republican National Committee)
-- Owner: Brent Brooks (bbrooks@gop.com)
-- Plan: Enterprise (full access to all features with Competitive Insights)

-- Step 1: Create the Client record
INSERT INTO "Client" (
  "id",
  "name",
  "description",
  "active",
  "dataRetentionDays",
  "createdAt",
  "updatedAt",
  "slug",
  "subscriptionPlan",
  "hasCompetitiveInsights",
  "emailVolumeLimit",
  "emailVolumeUsed",
  "subscriptionStartDate",
  "subscriptionRenewDate",
  "lastUsageReset",
  "stripeCustomerId",
  "stripeSubscriptionId",
  "stripeCiSubscriptionItemId",
  "stripeSubscriptionItemId",
  "stripeCiSubscriptionId",
  "subscriptionStatus",
  "cancelAtPeriodEnd",
  "scheduledDowngradePlan"
)
VALUES (
  'RNC',
  'RNC',
  'Republican National Committee - Enterprise demo account with CI',
  true,
  90,
  NOW(),
  NOW(),
  'rnc',
  'enterprise',
  true,
  999999,  -- Unlimited emails for enterprise
  0,
  NOW(),
  NOW() + INTERVAL '1 year',  -- 1 year subscription
  NOW(),
  NULL,  -- No Stripe customer since it's a demo
  NULL,
  NULL,
  NULL,
  NULL,
  'active',
  false,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  "subscriptionPlan" = 'enterprise',
  "subscriptionStatus" = 'active',
  "hasCompetitiveInsights" = true,
  "emailVolumeLimit" = 999999,
  "active" = true,
  "updatedAt" = NOW();

-- Step 2: Create the Owner user (Brent Brooks)
-- Password: "RNC2025!" (hashed with bcrypt, cost 10)
-- Password hash generated with: bcrypt.hashSync('RNC2025!', 10)
INSERT INTO "User" (
  "id",
  "email",
  "firstName",
  "lastName",
  "password",
  "role",
  "firstLogin",
  "lastActive",
  "createdAt",
  "updatedAt",
  "clientId"
)
VALUES (
  gen_random_uuid()::text,
  'bbrooks@gop.com',
  'Brent',
  'Brooks',
  '$2b$10$K/wexYL6/H3qXwCX6TXdH.v8CphrCdUbKYh03gpD0Lfny1BUKzTsa', -- Password: RNC2025!
  'owner', -- Owner role with full permissions
  true, -- Will be prompted to change password on first login
  NOW(),
  NOW(),
  NOW(),
  'RNC'
)
ON CONFLICT (email) DO UPDATE SET
  "role" = 'owner',
  "clientId" = 'RNC',
  "firstName" = 'Brent',
  "lastName" = 'Brooks',
  "firstLogin" = true,
  "updatedAt" = NOW();

-- Step 3: Verify the account was created
SELECT 
  c."id" as client_id,
  c."name",
  c."slug",
  c."subscriptionPlan",
  c."subscriptionStatus",
  c."hasCompetitiveInsights",
  c."emailVolumeLimit",
  c."active",
  u."email",
  u."firstName",
  u."lastName",
  u."role",
  u."firstLogin"
FROM "Client" c
LEFT JOIN "User" u ON u."clientId" = c."id"
WHERE c."id" = 'RNC';

-- DEMO ACCOUNT DETAILS:
-- Email: bbrooks@gop.com
-- Temporary Password: RNC2025!
-- User will be prompted to set a new password on first login
--
-- Enterprise Features Enabled:
-- ✓ Unlimited email volume
-- ✓ Competitive Insights (CI) enabled
-- ✓ 90 days data retention
-- ✓ Unlimited CI history
-- ✓ Unlimited entity follows
-- ✓ Personal email tracking
-- ✓ Inbox tools access
-- ✓ Unlimited seed tests
-- ✓ Can add own seeds
