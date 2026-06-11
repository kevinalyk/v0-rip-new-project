-- Migration: Add messageTypeReasoning column to CompetitiveInsightCampaign
-- Run this in your Neon SQL editor before deploying the code changes.
--
-- Safe to run multiple times (uses IF NOT EXISTS equivalent via DO block).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'CompetitiveInsightCampaign'
      AND column_name = 'messageTypeReasoning'
  ) THEN
    ALTER TABLE "CompetitiveInsightCampaign"
      ADD COLUMN "messageTypeReasoning" TEXT;
    RAISE NOTICE 'Column messageTypeReasoning added.';
  ELSE
    RAISE NOTICE 'Column messageTypeReasoning already exists — skipping.';
  END IF;
END $$;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'CompetitiveInsightCampaign'
  AND column_name = 'messageTypeReasoning';
