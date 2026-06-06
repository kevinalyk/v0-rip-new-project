-- =============================================================================
-- Migration: Clear "fundraising_ask" from campaign message types
-- Run in Neon SQL editor. Safe to run multiple times (idempotent).
-- =============================================================================

-- STEP 1: Preview — see how many rows will be affected before touching anything.
-- Review these counts before proceeding to STEP 2.

SELECT
  'only fundraising_ask' AS category,
  COUNT(*) AS row_count
FROM "CompetitiveInsightCampaign"
WHERE "messageTypes" = ARRAY['fundraising_ask']::text[]

UNION ALL

SELECT
  'fundraising_ask alongside others' AS category,
  COUNT(*) AS row_count
FROM "CompetitiveInsightCampaign"
WHERE 'fundraising_ask' = ANY("messageTypes")
  AND array_length("messageTypes", 1) > 1

UNION ALL

SELECT
  'total rows with fundraising_ask' AS category,
  COUNT(*) AS row_count
FROM "CompetitiveInsightCampaign"
WHERE 'fundraising_ask' = ANY("messageTypes");


-- =============================================================================
-- STEP 2: Clear rows where "fundraising_ask" is the ONLY type.
-- These become an empty array (unclassified) — no other data is changed.
-- =============================================================================

UPDATE "CompetitiveInsightCampaign"
SET
  "messageTypes" = ARRAY[]::text[],
  "updatedAt"    = NOW()
WHERE "messageTypes" = ARRAY['fundraising_ask']::text[];


-- =============================================================================
-- STEP 3: Remove "fundraising_ask" from rows where OTHER types also exist.
-- array_remove is non-destructive — all other tags are preserved.
-- =============================================================================

UPDATE "CompetitiveInsightCampaign"
SET
  "messageTypes" = array_remove("messageTypes", 'fundraising_ask'),
  "updatedAt"    = NOW()
WHERE 'fundraising_ask' = ANY("messageTypes")
  AND array_length("messageTypes", 1) > 1;


-- =============================================================================
-- STEP 4: Verify — confirm zero rows still have "fundraising_ask".
-- Expected result: 0
-- =============================================================================

SELECT COUNT(*) AS remaining_fundraising_ask_rows
FROM "CompetitiveInsightCampaign"
WHERE 'fundraising_ask' = ANY("messageTypes");
