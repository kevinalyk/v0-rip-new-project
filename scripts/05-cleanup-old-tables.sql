-- Clean up old tables that are no longer needed in the new client-based architecture
-- Based on user requirements: Keep User and SeedEmail data, delete everything else

-- First, let's see what tables currently exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- TABLES TO DELETE (as specified by user):
-- - Campaign (testing data, not important)
-- - Domain (replaced by Client system)
-- - DomainSetting (replaced by client-based settings)
-- - EmailContent (not needed)
-- - EmailQueue (appears unused)
-- - EngagementLog (testing data)
-- - Result (testing data)
-- - UserDomainAccess (replaced by client-based access)

-- Drop foreign key constraints first to avoid dependency issues
-- Note: Some of these constraints may not exist, so we use IF EXISTS

-- Drop Campaign related constraints
ALTER TABLE "Campaign" DROP CONSTRAINT IF EXISTS "Campaign_domainId_fkey";

-- Drop UserDomainAccess constraints
ALTER TABLE "UserDomainAccess" DROP CONSTRAINT IF EXISTS "UserDomainAccess_userId_fkey";
ALTER TABLE "UserDomainAccess" DROP CONSTRAINT IF EXISTS "UserDomainAccess_domainId_fkey";

-- Drop DomainSetting constraints
ALTER TABLE "DomainSetting" DROP CONSTRAINT IF EXISTS "DomainSetting_domainId_fkey";

-- Drop Result constraints (if they reference campaigns)
ALTER TABLE "Result" DROP CONSTRAINT IF EXISTS "Result_campaignId_fkey";

-- Drop EngagementLog constraints (if they exist)
ALTER TABLE "EngagementLog" DROP CONSTRAINT IF EXISTS "EngagementLog_campaignId_fkey";
ALTER TABLE "EngagementLog" DROP CONSTRAINT IF EXISTS "EngagementLog_resultId_fkey";

-- Drop EmailContent constraints (if they exist)
ALTER TABLE "EmailContent" DROP CONSTRAINT IF EXISTS "EmailContent_campaignId_fkey";

-- Drop EmailQueue constraints (if they exist)
ALTER TABLE "EmailQueue" DROP CONSTRAINT IF EXISTS "EmailQueue_campaignId_fkey";

-- Now drop the tables (in dependency order)
DROP TABLE IF EXISTS "EngagementLog";
DROP TABLE IF EXISTS "Result";
DROP TABLE IF EXISTS "EmailQueue";
DROP TABLE IF EXISTS "EmailContent";
DROP TABLE IF EXISTS "Campaign";
DROP TABLE IF EXISTS "UserDomainAccess";
DROP TABLE IF EXISTS "DomainSetting";
DROP TABLE IF EXISTS "Domain";

-- Drop any related indexes that might still exist
DROP INDEX IF EXISTS "Campaign_domainId_idx";
DROP INDEX IF EXISTS "Campaign_domainId_sentDate_idx";
DROP INDEX IF EXISTS "UserDomainAccess_userId_domainId_key";
DROP INDEX IF EXISTS "DomainSetting_domainId_key_key";
DROP INDEX IF EXISTS "Domain_name_key";
DROP INDEX IF EXISTS "Domain_domain_key";

-- Verify what tables remain (should be User, SeedEmail, Client, ClientSeedEmail, and Setting)
SELECT 
    table_name,
    CASE 
        WHEN table_name IN ('User', 'SeedEmail', 'Client', 'ClientSeedEmail', 'Setting') 
        THEN 'KEPT - Core table'
        ELSE 'UNKNOWN - Review needed'
    END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY 
    CASE WHEN table_name IN ('User', 'SeedEmail', 'Client', 'ClientSeedEmail', 'Setting') THEN 1 ELSE 2 END,
    table_name;

-- Show summary of what we kept
SELECT 'Cleanup completed - Old domain-based tables removed' as status;
SELECT 'Remaining tables: User, SeedEmail, Client, ClientSeedEmail, Setting' as summary;
