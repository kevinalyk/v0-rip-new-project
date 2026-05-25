-- Migration: add shareTokenSource column to CompetitiveInsightCampaign and SmsQueue
-- Run this script against your production database before deploying the code changes.

-- ── CompetitiveInsightCampaign ──────────────────────────────────────────────
ALTER TABLE "CompetitiveInsightCampaign"
  ADD COLUMN IF NOT EXISTS "shareTokenSource" TEXT;

-- Back-fill existing tokens as 'Unknown' so we know they predate this change
UPDATE "CompetitiveInsightCampaign"
SET "shareTokenSource" = 'Unknown'
WHERE "shareToken" IS NOT NULL
  AND "shareTokenSource" IS NULL;

-- ── SmsQueue ─────────────────────────────────────────────────────────────────
ALTER TABLE "SmsQueue"
  ADD COLUMN IF NOT EXISTS "shareTokenSource" TEXT;

UPDATE "SmsQueue"
SET "shareTokenSource" = 'Unknown'
WHERE "shareToken" IS NOT NULL
  AND "shareTokenSource" IS NULL;
