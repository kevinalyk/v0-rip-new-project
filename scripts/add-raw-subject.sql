-- Add rawSubject column to CompetitiveInsightCampaign
-- Stores the original subject line before AI redaction, used for accurate dedup in the CRON.
-- Nullable so existing rows are unaffected; new rows will populate it going forward.
ALTER TABLE "CompetitiveInsightCampaign"
ADD COLUMN IF NOT EXISTS "rawSubject" TEXT;
