-- Migration: Add donationPlatform column to CompetitiveInsightCampaign
-- Run this on Neon before deploying the backfill tool.
--
-- Values will be one of: 'winred' | 'actblue' | 'anedot' | 'psq' | NULL
-- NULL means no recognised donation platform link was found in ctaLinks.

ALTER TABLE "CompetitiveInsightCampaign"
  ADD COLUMN IF NOT EXISTS "donationPlatform" TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_donationPlatform_idx"
  ON "CompetitiveInsightCampaign" ("donationPlatform");
