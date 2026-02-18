-- Clear existing data first (since we're changing the model)
DELETE FROM "UserDomainAccess";
DELETE FROM "Domain";

-- Create example client domains (these represent companies that send emails)
INSERT INTO "Domain" (id, name, domain, description, "dataRetentionDays", active, "createdAt", "updatedAt")
VALUES 
  (gen_random_uuid(), 'Example Client 1', 'example-client1.com', 'Example client domain for testing - represents a company that sends emails', 90, true, NOW(), NOW()),
  (gen_random_uuid(), 'Example Client 2', 'example-client2.com', 'Another example client domain - different retention period', 180, true, NOW(), NOW());

-- Get the domain IDs we just created
WITH domain_ids AS (
  SELECT id, domain FROM "Domain" WHERE domain IN ('example-client1.com', 'example-client2.com')
),
user_ids AS (
  SELECT id, email FROM "User" WHERE email IN ('ryanlyk@gmail.com', 'austin@redsparkstrategy.com', 'kevinalyk@gmail.com')
)
-- Give all admin users access to all client domains
INSERT INTO "UserDomainAccess" (id, "userId", "domainId", role, "createdAt", "updatedAt")
SELECT 
  gen_random_uuid(),
  u.id,
  d.id,
  'admin',
  NOW(),
  NOW()
FROM user_ids u
CROSS JOIN domain_ids d;

-- Verify the setup
SELECT 
  u.email as "RIP Employee",
  d.name as "Client Domain",
  d.domain as "Domain",
  d."dataRetentionDays" as "Retention Days",
  uda.role as "Access Role"
FROM "UserDomainAccess" uda
JOIN "User" u ON uda."userId" = u.id
JOIN "Domain" d ON uda."domainId" = d.id
ORDER BY u.email, d.name;
