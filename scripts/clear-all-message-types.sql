-- ============================================================
-- Clear ALL messageTypes on CompetitiveInsightCampaign
-- Run this in the Neon SQL editor to reset for re-classification.
-- ============================================================

-- Step 1: Preview how many rows will be affected
SELECT COUNT(*) AS rows_to_clear
FROM "CompetitiveInsightCampaign"
WHERE array_length("messageTypes", 1) > 0
   OR "messageTypes" IS NOT NULL;

-- Step 2: Clear all messageTypes (set to empty array)
-- Uncomment and run after reviewing Step 1.
/*
UPDATE "CompetitiveInsightCampaign"
SET "messageTypes" = '{}'
WHERE true;
*/

-- Step 3: Verify — should return 0 rows with any types set
/*
SELECT COUNT(*) AS rows_still_with_types
FROM "CompetitiveInsightCampaign"
WHERE array_length("messageTypes", 1) > 0;
*/
