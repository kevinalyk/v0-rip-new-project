-- Migration: Clear all sender provider assignments so the cron re-resolves
-- everything via IP / ARIN RDAP only (the new single source of truth).
--
-- Run this in the Neon SQL editor before the next cron run.

-- 1. Clear sendingProvider and dkimSelector on all campaigns
UPDATE "CompetitiveInsightCampaign"
SET
  "sendingProvider" = NULL,
  "dkimSelector"    = NULL;

-- 2. Delete all IpSenderMappings so RDAP is re-queried fresh for every IP
DELETE FROM "IpSenderMapping";

-- 3. (Optional) Verify counts after running
SELECT
  COUNT(*) FILTER (WHERE "sendingProvider" IS NULL) AS campaigns_cleared,
  COUNT(*) FILTER (WHERE "sendingProvider" IS NOT NULL) AS campaigns_still_assigned
FROM "CompetitiveInsightCampaign";
