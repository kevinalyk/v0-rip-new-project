-- Add viewCount to CompetitiveInsightCampaign (email campaigns)
ALTER TABLE "CompetitiveInsightCampaign"
  ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0;

-- Add viewCount to SmsQueue (SMS campaigns)
ALTER TABLE "SmsQueue"
  ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0;
