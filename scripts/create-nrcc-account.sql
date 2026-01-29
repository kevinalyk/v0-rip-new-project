-- Create NRCC Enterprise Demo Account
-- Client: NRCC (National Republican Congressional Committee)
-- Owner: Triston Foster (tfoster@nrcc.org)
-- Plan: Enterprise (full access to all features)

-- Updated to match exact database schema columns from CSV exports

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
  'NRCC',
  'NRCC',
  'National Republican Congressional Committee - Enterprise demo account',
  true,
  90,
  NOW(),
  NOW(),
  'nrcc',
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

-- Step 2: Create the Owner user (Triston Foster)
-- Password: "NRCC2025!" (hashed with bcrypt, cost 10)
-- User will be prompted to change password on first login
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
  'tfoster@nrcc.org',
  'Triston',
  'Foster',
  '$2a$10$YQ8/xK8vN3QqXqXzZqZqZeZqZqZqZqZqZqZqZqZqZqZqZqZqZqZqZ', -- Placeholder - needs actual bcrypt hash
  'admin', -- Full admin access
  true, -- Will be prompted to set password on first login
  NOW(),
  NOW(),
  NOW(),
  'NRCC'
)
ON CONFLICT (email) DO UPDATE SET
  "role" = 'admin',
  "clientId" = 'NRCC',
  "firstName" = 'Triston',
  "lastName" = 'Foster',
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
  u."email",
  u."firstName",
  u."lastName",
  u."role"
FROM "Client" c
LEFT JOIN "User" u ON u."clientId" = c."id"
WHERE c."id" = 'NRCC';

-- IMPORTANT NOTES:
-- 1. The password hash above is a PLACEHOLDER. You need to generate a real bcrypt hash.
-- 2. To generate the hash, run this in Node.js:
--    const bcrypt = require('bcryptjs');
--    const hash = bcrypt.hashSync('NRCC2025!', 10);
--    console.log(hash);
-- 3. Replace the password hash in the INSERT statement above with the real hash.
-- 4. Or, you can use the password reset flow to set the password via email.
-- 5. Enterprise plan features include:
--    - Unlimited email volume
--    - Unlimited CI history
--    - Unlimited entity follows
--    - Personal email tracking
--    - Inbox tools access
--    - Unlimited seed tests
--    - Can add own seeds
