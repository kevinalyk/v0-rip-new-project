-- Migration: Add subjectPatterns column to CompetitiveInsightCampaign
-- Feature #3 — Subject Line Pattern Analysis
--
-- Stores an array of pattern keys detected in the subject line at ingest.
-- Keys match SUBJECT_PATTERNS in lib/subject-line-classifier.ts:
--   all_caps | caps_word | question | exclamation | short | long |
--   emoji | personalization | number_dollar | urgency
--
-- Run this once against the production database.
-- After running, trigger the backfill script (see below) or use the API route
-- to populate existing rows.

ALTER TABLE "CompetitiveInsightCampaign"
  ADD COLUMN IF NOT EXISTS "subjectPatterns" TEXT[] NOT NULL DEFAULT '{}';

-- Index for fast filtering by pattern (GIN on array column)
CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_subjectPatterns_idx"
  ON "CompetitiveInsightCampaign" USING GIN ("subjectPatterns");

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'CompetitiveInsightCampaign'
  AND column_name = 'subjectPatterns';
