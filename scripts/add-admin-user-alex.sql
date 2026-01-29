-- Add new admin user alex@redsparkstrategy.com
-- Temporary password: TempAdmin2024!

INSERT INTO "User" (
  id,
  email,
  "firstName",
  "lastName",
  password,
  role,
  "firstLogin",
  "createdAt",
  "updatedAt"
) VALUES (
  gen_random_uuid()::text,
  'hanna@redsparkstrategy.com',
  'Hannah',
  'Red Spark Strategy',
  '$2y$10$Wl4OnPaukRiHPGpEtrtBm.ei0rOowKRttbVBuV7EdV86Whge3N6uG', -- bcrypt hash for "TempAdmin2024!"
  'admin',
  true,
  NOW(),
  NOW()
);

-- Check if user was created successfully
SELECT id, email, "firstName", "lastName", role, "firstLogin", "createdAt" 
FROM "User" 
WHERE email = 'alex@redsparkstrategy.com';
