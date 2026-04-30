-- ============================================================================
-- Cleanup script: undo the FEC scraper's first run
-- ============================================================================
-- This script:
--   1. Collects all CiEntity IDs that were auto-created and linked from a
--      CampaignLaunch row (these are the FEC stubs).
--   2. Deletes CampaignLaunch rows first (so the FK doesn't block).
--   3. Deletes those linked CiEntity rows ONLY IF they look like untouched
--      stubs — no bio, no image, no ballotpedia, and no mappings/subscriptions
--      /campaigns/tags pointing at them. This protects anything you've edited
--      or anything a real client is already following.
--
-- Run this in Neon. Idempotent — safe to re-run.
-- ============================================================================

BEGIN;

-- 1. Identify entities the FEC scraper auto-created
CREATE TEMP TABLE _fec_entity_ids AS
SELECT DISTINCT "linkedEntityId" AS id
FROM "CampaignLaunch"
WHERE "linkedEntityId" IS NOT NULL
  AND source = 'fec';

-- 2. Wipe the CampaignLaunch table entirely
DELETE FROM "CampaignLaunch";

-- 3. Delete only the untouched stubs.
--    "Untouched" means: candidate type, no enrichment, and no relations
--    in any of the tables that would indicate real-world use.
DELETE FROM "CiEntity"
WHERE id IN (SELECT id FROM _fec_entity_ids)
  AND type = 'candidate'
  AND (bio IS NULL OR bio = '')
  AND ("imageUrl" IS NULL OR "imageUrl" = '')
  AND ("ballotpediaUrl" IS NULL OR "ballotpediaUrl" = '')
  AND id NOT IN (SELECT "entityId" FROM "CiEntityMapping")
  AND id NOT IN (SELECT "entityId" FROM "CiEntitySubscription")
  AND id NOT IN (SELECT "entityId" FROM "CompetitiveInsightCampaign")
  AND id NOT IN (SELECT "entityId" FROM "EntityTag");

-- Visibility report
SELECT
  (SELECT COUNT(*) FROM "CampaignLaunch")                                                   AS remaining_launches,
  (SELECT COUNT(*) FROM _fec_entity_ids)                                                    AS fec_entities_identified,
  (SELECT COUNT(*) FROM "CiEntity" WHERE id IN (SELECT id FROM _fec_entity_ids))            AS fec_entities_remaining;

DROP TABLE _fec_entity_ids;

COMMIT;
