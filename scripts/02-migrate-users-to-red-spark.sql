-- Migrate all existing users to Red Spark client
-- This assigns all current users to the default Red Spark client

-- First, let's check how many users we have
SELECT COUNT(*) as total_users FROM "User";

-- Update all existing users to belong to Red Spark client
UPDATE "User" 
SET "clientId" = 'client_red_spark_001'
WHERE "clientId" IS NULL;

-- Verify the migration
SELECT 
    u.id,
    u.email,
    u.firstName,
    u.lastName,
    u.role,
    c.name as client_name
FROM "User" u
LEFT JOIN "Client" c ON u."clientId" = c.id
ORDER BY u.email;

-- Show summary of migration
SELECT 
    c.name as client_name,
    COUNT(u.id) as user_count
FROM "Client" c
LEFT JOIN "User" u ON c.id = u."clientId"
GROUP BY c.id, c.name
ORDER BY user_count DESC;

-- Now we can safely add the foreign key constraint
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" 
FOREIGN KEY ("clientId") REFERENCES "Client"("id") 
ON DELETE SET NULL ON UPDATE CASCADE;

SELECT 'User migration to Red Spark completed' as status;
