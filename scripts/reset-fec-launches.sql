-- ===================================================================
-- Reset FEC campaign launches so the scraper can re-pull them with
-- the new name formatting + auto-entity-creation logic.
--
-- After running this, manually trigger the scraper:
--   GET /api/cron/scrape-fec-launches?secret=<CRON_SECRET>
--
-- The next run will:
--   1. Re-pull the same 7-day window from FEC
--   2. Re-format names (drop middle names, keep last names + suffixes)
--   3. Auto-create a CiEntity for each new launch
--   4. Link each CampaignLaunch to its matching entity
-- ===================================================================

-- Wipe all FEC-sourced campaign launches. (Manual entries with
-- source != 'fec' are preserved.)
DELETE FROM "CampaignLaunch" WHERE source = 'fec';

-- Verify the cleanup
SELECT
  COUNT(*) AS remaining_fec_launches
FROM "CampaignLaunch"
WHERE source = 'fec';
