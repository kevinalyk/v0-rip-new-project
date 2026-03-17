-- Migration: Add rawSubject column to CompetitiveInsightCampaign
-- This column stores the original subject line before name redaction / [Omitted] substitution.
-- It is used by the detect-competitive-insights CRON to accurately dedup campaigns
-- even when the stored subject has been redacted and the incoming subject still has a real name.

ALTER TABLE "CompetitiveInsightCampaign"
  ADD COLUMN IF NOT EXISTS "rawSubject" TEXT;
