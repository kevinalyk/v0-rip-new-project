-- Clear sendingIp and sendingProvider from all CI campaigns.
-- Clear all orgName, cidr, and reset rdapChecked on all IpSenderMapping rows.
-- The cron will re-resolve everything fresh on its next run.

-- Step 1: Clear IP and provider info from all CI campaigns
UPDATE "CompetitiveInsightCampaign"
SET
  "sendingIp"       = NULL,
  "sendingProvider" = NULL;

-- Step 2: Reset the entire IpSenderMapping table
UPDATE "IpSenderMapping"
SET
  "orgName"      = NULL,
  "cidr"         = NULL,
  "rdapChecked"  = false;
