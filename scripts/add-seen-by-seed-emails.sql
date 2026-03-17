-- Migration: Add seenBySeedEmails column to CompetitiveInsightCampaign
-- This JSON array tracks which seed email addresses have already contributed
-- inbox/spam counts to each campaign row, preventing double-counting on
-- repeat CRON runs and race conditions.

ALTER TABLE "CompetitiveInsightCampaign"
ADD COLUMN IF NOT EXISTS "seenBySeedEmails" JSONB NOT NULL DEFAULT '[]';
