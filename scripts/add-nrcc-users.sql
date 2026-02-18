-- Add NRCC Users
-- Adding 5 users to the NRCC client
-- All users will be prompted to change password on first login

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
VALUES 
(
  gen_random_uuid()::text,
  'bleiser@nrcc.org',
  'Brandon',
  'Leiser',
  '$2y$10$chr9AFf32/oHBk8p7e1ljeHFcUYo0x626yUImzSMKdxrVpGCE8OAq',
  'user',
  true,
  NOW(),
  NOW(),
  NOW(),
  'NRCC'
),
(
  gen_random_uuid()::text,
  'mbarrientos@nrcc.org',
  'Michelle',
  'Barrientos',
  '$2y$10$chr9AFf32/oHBk8p7e1ljeHFcUYo0x626yUImzSMKdxrVpGCE8OAq',
  'user',
  true,
  NOW(),
  NOW(),
  NOW(),
  'NRCC'
),
(
  gen_random_uuid()::text,
  'mrobinson@nrcc.org',
  'Michael',
  'Robinson',
  '$2y$10$chr9AFf32/oHBk8p7e1ljeHFcUYo0x626yUImzSMKdxrVpGCE8OAq',
  'user',
  true,
  NOW(),
  NOW(),
  NOW(),
  'NRCC'
),
(
  gen_random_uuid()::text,
  'wrosichan@nrcc.org',
  'William',
  'Rosichan',
  '$2y$10$chr9AFf32/oHBk8p7e1ljeHFcUYo0x626yUImzSMKdxrVpGCE8OAq',
  'user',
  true,
  NOW(),
  NOW(),
  NOW(),
  'NRCC'
),
(
  gen_random_uuid()::text,
  'tgueli@nrcc.org',
  'Thomas',
  'Gueli',
  '$2y$10$chr9AFf32/oHBk8p7e1ljeHFcUYo0x626yUImzSMKdxrVpGCE8OAq',
  'user',
  true,
  NOW(),
  NOW(),
  NOW(),
  'NRCC'
)
ON CONFLICT (email) DO UPDATE SET
  "firstName" = EXCLUDED."firstName",
  "lastName" = EXCLUDED."lastName",
  "password" = EXCLUDED."password",
  "role" = EXCLUDED."role",
  "firstLogin" = EXCLUDED."firstLogin",
  "clientId" = EXCLUDED."clientId",
  "updatedAt" = NOW();

-- Verify the users were created
SELECT 
  u."id",
  u."email",
  u."firstName",
  u."lastName",
  u."role",
  u."firstLogin",
  u."clientId",
  u."createdAt"
FROM "User" u
WHERE u."clientId" = 'NRCC'
ORDER BY u."createdAt" DESC;
