-- Script to add Apex Strategies client and Brandon as admin user
-- This is a trial run with full enterprise features
-- Created: 2026-02-12

-- Step 1: Create the Apex Strategies client with full enterprise features
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
  "scheduledDowngradePlan",
  "userSeatsIncluded",
  "additionalUserSeats",
  "stripeUserSeatPriceId",
  "totalUsers",
  "stripeUserSeatsItemId"
) VALUES (
  'apex_strategies',                           -- id (using snake_case for consistency)
  'Apex Strategies',                           -- name
  'Apex Strategies - Trial Client',           -- description
  true,                                        -- active
  365,                                         -- dataRetentionDays (1 year)
  NOW(),                                       -- createdAt
  NOW(),                                       -- updatedAt
  'apex-strategies',                           -- slug
  'enterprise',                                -- subscriptionPlan (full enterprise)
  true,                                        -- hasCompetitiveInsights (CI enabled)
  999999,                                      -- emailVolumeLimit (unlimited for trial)
  0,                                           -- emailVolumeUsed
  NOW(),                                       -- subscriptionStartDate
  NULL,                                        -- subscriptionRenewDate (trial - no renewal)
  NOW(),                                       -- lastUsageReset
  NULL,                                        -- stripeCustomerId (no Stripe for trial)
  NULL,                                        -- stripeSubscriptionId
  NULL,                                        -- stripeCiSubscriptionItemId
  NULL,                                        -- stripeSubscriptionItemId
  NULL,                                        -- stripeCiSubscriptionId
  'active',                                    -- subscriptionStatus
  false,                                       -- cancelAtPeriodEnd
  NULL,                                        -- scheduledDowngradePlan
  999,                                         -- userSeatsIncluded (max users)
  0,                                           -- additionalUserSeats
  NULL,                                        -- stripeUserSeatPriceId
  1,                                           -- totalUsers (Brandon)
  NULL                                         -- stripeUserSeatsItemId
);

-- Step 2: Create Brandon as admin user for Apex Strategies
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
) VALUES (
  gen_random_uuid(),                                                        -- id (auto-generate UUID)
  'brandon@apexstrategies.us',                                              -- email
  'Brandon',                                                                -- firstName
  '',                                                                       -- lastName (unknown)
  '$2y$10$URuEJH1dVrdd1qIwoDnGfutZGOpF9wIJnT8LkMP9l8svfJ2nlKL8e',          -- password (TempPassword2026!)
  'admin',                                                                  -- role
  true,                                                                     -- firstLogin (must reset password)
  NULL,                                                                     -- lastActive
  NOW(),                                                                    -- createdAt
  NOW(),                                                                    -- updatedAt
  'apex_strategies'                                                         -- clientId
);

-- Step 3: Verify the setup
SELECT 
  'Client Created' as status,
  c."id",
  c."name",
  c."slug",
  c."subscriptionPlan",
  c."hasCompetitiveInsights",
  c."userSeatsIncluded",
  c."totalUsers"
FROM "Client" c
WHERE c."id" = 'apex_strategies';

SELECT 
  'User Created' as status,
  u."id",
  u."email",
  u."firstName",
  u."lastName",
  u."role",
  u."firstLogin",
  u."clientId"
FROM "User" u
WHERE u."email" = 'brandon@apexstrategies.us';
