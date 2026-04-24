-- reset-all-ip-orgnames-v2.sql
--
-- Clears ALL auto-resolved RDAP data (orgName, cidr, rdapChecked) from
-- IpSenderMapping so the next cron run re-resolves every IP using the
-- corrected lookupRdap logic that returns the most-specific network block
-- (e.g. MessageGears) instead of the parent allocation (e.g. Limestone Networks).
--
-- Rows where an admin has already set a friendlyName are intentionally
-- preserved — those are manual overrides and should not be re-resolved.
-- Remove the WHERE clause if you want a truly full wipe including those.

UPDATE "IpSenderMapping"
SET
  "orgName"       = NULL,
  "cidr"          = NULL,
  "rdapChecked"   = false,
  "lastLookedUpAt" = NULL
WHERE
  "friendlyName" IS NULL;  -- preserve manual overrides

-- Show a summary of what was reset vs. preserved
SELECT
  COUNT(*) FILTER (WHERE "friendlyName" IS NULL AND "rdapChecked" = false) AS reset_count,
  COUNT(*) FILTER (WHERE "friendlyName" IS NOT NULL)                       AS preserved_manual_overrides,
  COUNT(*)                                                                  AS total_rows
FROM "IpSenderMapping";
