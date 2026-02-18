-- Add hide feature to CompetitiveInsightCampaign and SmsQueue tables
-- This allows super_admins to hide campaigns/SMS while keeping them in database

-- Add columns to CompetitiveInsightCampaign
ALTER TABLE "CompetitiveInsightCampaign" 
ADD COLUMN IF NOT EXISTS "isHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "hiddenBy" TEXT;

-- Add columns to SmsQueue
ALTER TABLE "SmsQueue" 
ADD COLUMN IF NOT EXISTS "isHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "hiddenBy" TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_isHidden_idx" ON "CompetitiveInsightCampaign"("isHidden");
CREATE INDEX IF NOT EXISTS "SmsQueue_isHidden_idx" ON "SmsQueue"("isHidden");
