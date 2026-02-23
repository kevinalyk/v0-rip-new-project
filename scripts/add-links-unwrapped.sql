-- Add linksUnwrapped column to CompetitiveInsightCampaign
ALTER TABLE "CompetitiveInsightCampaign" ADD COLUMN IF NOT EXISTS "linksUnwrapped" BOOLEAN NOT NULL DEFAULT false;

-- Add linksUnwrapped column to SmsQueue
ALTER TABLE "SmsQueue" ADD COLUMN IF NOT EXISTS "linksUnwrapped" BOOLEAN NOT NULL DEFAULT false;

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_linksUnwrapped_idx" ON "CompetitiveInsightCampaign"("linksUnwrapped");
CREATE INDEX IF NOT EXISTS "SmsQueue_linksUnwrapped_idx" ON "SmsQueue"("linksUnwrapped");
