-- Extend the legacy campaign-launch alert table without changing existing rows.
ALTER TABLE "CampaignAlertSubscription"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'campaign_launch',
  ADD COLUMN "clientId" TEXT,
  ADD COLUMN "search" TEXT,
  ADD COLUMN "entityIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "entityType" TEXT,
  ADD COLUMN "messageTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "ownershipTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "donationPlatform" TEXT,
  ADD COLUMN "subscriptionsOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tag" TEXT,
  ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "CampaignAlertSubscription_kind_clientId_enabled_idx"
  ON "CampaignAlertSubscription"("kind", "clientId", "enabled");
CREATE INDEX "CampaignAlertSubscription_kind_enabled_idx"
  ON "CampaignAlertSubscription"("kind", "enabled");

CREATE TABLE "MobilePushToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expoPushToken" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'ios',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobilePushToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MobilePushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MobilePushToken_expoPushToken_key" ON "MobilePushToken"("expoPushToken");
CREATE UNIQUE INDEX "MobilePushToken_userId_deviceId_key" ON "MobilePushToken"("userId", "deviceId");
CREATE INDEX "MobilePushToken_userId_enabled_idx" ON "MobilePushToken"("userId", "enabled");

CREATE TABLE "MobileAlertDelivery" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expoTicketIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "matchedAlertIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileAlertDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MobileAlertDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MobileAlertDelivery_userId_sourceType_sourceId_key"
  ON "MobileAlertDelivery"("userId", "sourceType", "sourceId");
CREATE INDEX "MobileAlertDelivery_status_createdAt_idx"
  ON "MobileAlertDelivery"("status", "createdAt");
