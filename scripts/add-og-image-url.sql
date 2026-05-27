-- Add ogImageUrl column to store pre-generated OG screenshot URLs in Vercel Blob
-- This allows Twitter/X crawlers to get the image instantly without Puppeteer cold start

ALTER TABLE "CompetitiveInsightCampaign"
  ADD COLUMN IF NOT EXISTS "ogImageUrl" TEXT;

ALTER TABLE "SmsQueue"
  ADD COLUMN IF NOT EXISTS "ogImageUrl" TEXT;
