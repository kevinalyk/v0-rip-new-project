-- Reset campaigns that were incorrectly assigned a private/internal sending IP.
-- Private ranges: 10.0.0.0/8, 127.0.0.0/8, 192.168.0.0/16, 172.16.0.0/12
-- After running this, the next cron run will re-parse and correctly assign public IPs.

-- Step 1: Clear sendingIp and sendingProvider on campaigns with private IPs
UPDATE "CompetitiveInsightCampaign"
SET 
  "sendingIp" = NULL,
  "sendingProvider" = NULL,
  "updatedAt" = NOW()
WHERE 
  "sendingIp" IS NOT NULL
  AND (
    "sendingIp" LIKE '10.%'
    OR "sendingIp" LIKE '127.%'
    OR "sendingIp" LIKE '192.168.%'
    OR "sendingIp" ~ '^172\.(1[6-9]|2[0-9]|3[01])\.'
  );

-- Step 2: Remove the private IP entries from IpSenderMapping
-- (they're useless and will never match a real provider)
DELETE FROM "IpSenderMapping"
WHERE 
  ip LIKE '10.%'
  OR ip LIKE '127.%'
  OR ip LIKE '192.168.%'
  OR ip ~ '^172\.(1[6-9]|2[0-9]|3[01])\.';

-- Check what's left after the cleanup
SELECT COUNT(*) AS campaigns_needing_reprocess
FROM "CompetitiveInsightCampaign"
WHERE "rawHeaders" IS NOT NULL AND "sendingIp" IS NULL AND "isDeleted" = false;

SELECT COUNT(*) AS ip_mappings_remaining FROM "IpSenderMapping";
