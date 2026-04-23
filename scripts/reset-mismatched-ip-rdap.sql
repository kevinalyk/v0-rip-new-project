-- Reset rdapChecked = false for IP mappings where the orgName looks like a
-- datacenter/hosting parent rather than an ESP, so the cron re-looks them up
-- with the corrected lookupRdap logic that prefers the most-specific block.
--
-- This targets known hosting parents that should resolve to a child ESP:
-- Limestone Networks, Zayo, Lumen, CenturyLink, AWS, Google, Microsoft Azure,
-- etc. Add more as you encounter them.

UPDATE "IpSenderMapping"
SET
  "rdapChecked" = false,
  "orgName"     = NULL,
  "cidr"        = NULL
WHERE
  "rdapChecked" = true
  AND "friendlyName" IS NULL  -- don't touch rows an admin has manually named
  AND (
    "orgName" ILIKE '%limestone%'
    OR "orgName" ILIKE '%zayo%'
    OR "orgName" ILIKE '%lumen%'
    OR "orgName" ILIKE '%centurylink%'
    OR "orgName" ILIKE '%level 3%'
    OR "orgName" ILIKE '%cogent%'
    OR "orgName" ILIKE '%amazon%'
    OR "orgName" ILIKE '%google%'
    OR "orgName" ILIKE '%microsoft%'
    OR "orgName" ILIKE '%cloudflare%'
    OR "orgName" ILIKE '%rackspace%'
    OR "orgName" ILIKE '%digital ocean%'
    OR "orgName" ILIKE '%linode%'
    OR "orgName" ILIKE '%vultr%'
    OR "orgName" IS NULL
  );
