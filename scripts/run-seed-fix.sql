-- First, let's check if we have the default domain
SELECT * FROM "Domain" WHERE domain = 'default.rip-tool.com';

-- If no domain exists, create it
INSERT INTO "Domain" (id, name, domain, description, "dataRetentionDays", active, "createdAt", "updatedAt")
SELECT 
  gen_random_uuid(),
  'Default Organization',
  'default.rip-tool.com',
  'Default domain for initial setup',
  90,
  true,
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Domain" WHERE domain = 'default.rip-tool.com');

-- Get the domain ID for the next steps
-- (You'll need to run this and use the ID in the next part)
SELECT id FROM "Domain" WHERE domain = 'default.rip-tool.com';
