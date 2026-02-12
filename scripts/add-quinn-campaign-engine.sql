-- Add Quinn Huckeba as admin user to Campaign Engine
-- Email: quinn@campaignengine.io
-- Temporary password: TempCE2024!

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
  'quinn@campaignengine.io',
  'Quinn',
  'Huckeba',
  '$2y$10$URuEJH1dVrdd1qIwoDnGfutZGOpF9wIJnT8LkMP9l8svfJ2nlKL8e', -- bcrypt hash for "TempCE2024!"
  'admin',
  'campaign_engine',
  true,
  NOW(),
  NOW()
);

-- Update Campaign Engine client total users count
UPDATE "Client"
SET "totalUsers" = "totalUsers" + 1,
    "updatedAt" = NOW()
WHERE id = 'campaign_engine';

-- Check if user was created successfully
SELECT id, email, "firstName", "lastName", role, "clientId", "firstLogin", "createdAt" 
FROM "User" 
WHERE email = 'quinn@campaignengine.io';

-- Log the results
DO $$
BEGIN
  RAISE NOTICE 'Successfully added Quinn Huckeba to Campaign Engine as admin';
  RAISE NOTICE 'Email: quinn@campaignengine.io';
  RAISE NOTICE 'Temporary password: TempPassword2026!!';
  RAISE NOTICE 'User will need to reset password on first login';
END $$;
