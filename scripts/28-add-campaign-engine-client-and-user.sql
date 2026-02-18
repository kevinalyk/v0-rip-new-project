-- Create Campaign Engine client
INSERT INTO "Client" (
  id,
  name,
  slug,
  description,
  active,
  "subscriptionPlan",
  "subscriptionStatus",
  "hasCompetitiveInsights",
  "emailVolumeLimit",
  "emailVolumeUsed",
  "subscriptionStartDate",
  "lastUsageReset",
  "dataRetentionDays",
  "userSeatsIncluded",
  "additionalUserSeats",
  "totalUsers",
  "createdAt",
  "updatedAt"
) VALUES (
  'campaign_engine',
  'Campaign Engine',
  'campaign-engine',
  'Campaign Engine - Internal Client',
  true,
  'enterprise',
  'active',
  true,
  999999,
  0,
  NOW(),
  NOW(),
  365,
  999,
  0,
  1,
  NOW(),
  NOW()
);

-- Create user for Kenny Mika
INSERT INTO "User" (
  id,
  email,
  "firstName",
  "lastName",
  password,
  role,
  "clientId",
  "firstLogin",
  "createdAt",
  "updatedAt"
) VALUES (
  gen_random_uuid()::text,
  'ken@campaignengine.io',
  'Kenny',
  'Mika',
  '$2y$10$ALCjwoMEVmhP0wv8PL18h.ulCsotxBHywOw7IzcMrJQl7nh/NG.wS',
  'owner',
  'campaign_engine',
  true,
  NOW(),
  NOW()
);

-- Log the results
DO $$
BEGIN
  RAISE NOTICE 'Successfully created Campaign Engine client and user for Kenny Mika';
  RAISE NOTICE 'User will need to reset password on first login';
END $$;
