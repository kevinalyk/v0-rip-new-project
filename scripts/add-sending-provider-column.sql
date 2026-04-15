-- Migration: Add missing sendingProvider column to CompetitiveInsightCampaign
-- The schema.prisma already references this column but it was never added to the DB.

ALTER TABLE "CompetitiveInsightCampaign"
  ADD COLUMN IF NOT EXISTS "sendingProvider" TEXT;

CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_sendingProvider_idx"
  ON "CompetitiveInsightCampaign" ("sendingProvider");
