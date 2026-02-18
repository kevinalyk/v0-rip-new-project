-- Add isDeleted field to CompetitiveInsightCampaign and SmsQueue tables

ALTER TABLE "CompetitiveInsightCampaign"
ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "deletedBy" TEXT;

ALTER TABLE "SmsQueue"
ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "deletedBy" TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_isDeleted_idx" ON "CompetitiveInsightCampaign"("isDeleted");
CREATE INDEX IF NOT EXISTS "SmsQueue_isDeleted_idx" ON "SmsQueue"("isDeleted");

-- Log the changes
DO $$
BEGIN
  RAISE NOTICE 'Added isDeleted, deletedAt, and deletedBy fields to CompetitiveInsightCampaign and SmsQueue tables';
END $$;
