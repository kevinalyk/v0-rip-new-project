-- Add twitterPosted tracking fields to CompetitiveInsightCampaign and SmsQueue

ALTER TABLE "CompetitiveInsightCampaign"
  ADD COLUMN IF NOT EXISTS "twitterPosted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "twitterPostedAt" TIMESTAMP(3);

ALTER TABLE "SmsQueue"
  ADD COLUMN IF NOT EXISTS "twitterPosted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "twitterPostedAt" TIMESTAMP(3);
