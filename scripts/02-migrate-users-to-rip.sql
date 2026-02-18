-- Migrate all existing users to appropriate clients
-- This handles existing clientId values and creates missing Client records

-- First, let's check how many users we have
SELECT COUNT(*) as total_users FROM "User";

-- Create Client records for any clientId that exists in User table but not in Client table
INSERT INTO "Client" ("id", "name", "description", "active", "dataRetentionDays", "createdAt", "updatedAt")
SELECT DISTINCT 
    u."clientId" as id,
    CASE 
        WHEN u."clientId" = 'client_red_spark_001' THEN 'Red Spark Strategy'
        ELSE REPLACE(REPLACE(u."clientId", 'client_', ''), '_', ' ')
    END as name,
    'Auto-created from existing user data' as description,
    true as active,
    90 as "dataRetentionDays",
    CURRENT_TIMESTAMP as "createdAt",
    CURRENT_TIMESTAMP as "updatedAt"
FROM "User" u
WHERE u."clientId" IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM "Client" c WHERE c.id = u."clientId")
ON CONFLICT (id) DO NOTHING;

-- Update users without a clientId to belong to RIP master client
UPDATE "User" 
SET "clientId" = 'client_rip_master'
WHERE "clientId" IS NULL;

-- Verify the migration (using explicit column names with proper casing)
SELECT 
    u.id,
    u.email,
    u."firstName",
    u."lastName",
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

-- Add foreign key constraint only after all users have valid clientIds
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'User_clientId_fkey'
    ) THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" 
        FOREIGN KEY ("clientId") REFERENCES "Client"("id") 
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

SELECT 'User migration completed - all users assigned to clients' as status;
