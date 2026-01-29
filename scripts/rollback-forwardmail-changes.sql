-- Rollback Migration: Undo ForwardMail.net Changes
-- Description: Reverts all database changes made for ForwardMail.net integration
-- This script undoes changes in reverse order from how they were applied

-- Step 1: Drop columns and constraints added to CompetitiveInsightCampaign (last changes made)
DO $$
BEGIN
    -- Drop indexes if they exist
    DROP INDEX IF EXISTS "CompetitiveInsightCampaign_clientId_idx";
    DROP INDEX IF EXISTS "CompetitiveInsightCampaign_source_idx";
    
    -- Drop foreign key constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CompetitiveInsightCampaign_clientId_fkey'
    ) THEN
        ALTER TABLE "CompetitiveInsightCampaign" DROP CONSTRAINT "CompetitiveInsightCampaign_clientId_fkey";
    END IF;
    
    -- Drop columns if they exist
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'CompetitiveInsightCampaign' AND column_name = 'clientId'
    ) THEN
        ALTER TABLE "CompetitiveInsightCampaign" DROP COLUMN "clientId";
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'CompetitiveInsightCampaign' AND column_name = 'source'
    ) THEN
        ALTER TABLE "CompetitiveInsightCampaign" DROP COLUMN "source";
    END IF;
END $$;

-- Step 2: Drop the ClientEmailContent, ClientCampaign, and ClientEmailQueue tables
-- (These were dropped in the last script, but if they were recreated, we'll drop them)
DROP TABLE IF EXISTS "ClientEmailContent" CASCADE;
DROP TABLE IF EXISTS "ClientCampaign" CASCADE;
DROP TABLE IF EXISTS "ClientEmailQueue" CASCADE;

-- Step 3: Drop ClientPersonalEmail table (created in pasted-text-2.txt)
DROP TABLE IF EXISTS "ClientPersonalEmail" CASCADE;

-- Step 4: Drop all indexes that were created
DROP INDEX IF EXISTS "idx_client_personal_email_client";
DROP INDEX IF EXISTS "idx_client_personal_email_active";
DROP INDEX IF EXISTS "idx_client_email_queue_processed";
DROP INDEX IF EXISTS "idx_client_email_queue_personal";
DROP INDEX IF EXISTS "idx_client_campaign_personal";
DROP INDEX IF EXISTS "idx_client_campaign_date";

-- Verification: Show remaining tables
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename LIKE 'Client%'
ORDER BY tablename;
