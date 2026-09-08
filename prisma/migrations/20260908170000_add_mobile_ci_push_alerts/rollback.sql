DROP TABLE IF EXISTS "MobileAlertDelivery";
DROP TABLE IF EXISTS "MobilePushToken";

-- Mobile CI alerts cannot be represented by the legacy campaign-launch schema.
DELETE FROM "CampaignAlertSubscription" WHERE "kind" = 'ci_message';

DROP INDEX IF EXISTS "CampaignAlertSubscription_kind_clientId_enabled_idx";
DROP INDEX IF EXISTS "CampaignAlertSubscription_kind_enabled_idx";
ALTER TABLE "CampaignAlertSubscription"
  DROP COLUMN IF EXISTS "enabled",
  DROP COLUMN IF EXISTS "tag",
  DROP COLUMN IF EXISTS "subscriptionsOnly",
  DROP COLUMN IF EXISTS "donationPlatform",
  DROP COLUMN IF EXISTS "ownershipTypes",
  DROP COLUMN IF EXISTS "messageTypes",
  DROP COLUMN IF EXISTS "entityType",
  DROP COLUMN IF EXISTS "entityIds",
  DROP COLUMN IF EXISTS "search",
  DROP COLUMN IF EXISTS "clientId",
  DROP COLUMN IF EXISTS "kind";
