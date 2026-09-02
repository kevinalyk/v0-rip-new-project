-- Additional (paid, add-on) Slack bot channels on top of the existing free SlackIntegration.
-- Purely additive: no existing tables/columns are modified, so current single-bot behavior
-- and data are completely unaffected. Gated behind SLACK_MULTI_BOT_ENABLED until launch.

ALTER TABLE "Client"
  ADD COLUMN "additionalSlackBots" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stripeSlackBotsItemId" TEXT,
  ADD COLUMN "stripeSlackBotPriceId" TEXT;

CREATE UNIQUE INDEX "Client_stripeSlackBotsItemId_key" ON "Client"("stripeSlackBotsItemId");

CREATE TABLE "SlackChannel" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "slackIntegrationId" TEXT NOT NULL,
  "label" TEXT,
  "channelId" TEXT,
  "channelName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'awaiting_channel',
  "notifyOnFollowedEntityMessages" BOOLEAN NOT NULL DEFAULT true,
  "entityFilterConfigured" BOOLEAN NOT NULL DEFAULT false,
  "connectedByUserId" TEXT,
  "connectedAt" TIMESTAMP(3),
  "disconnectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SlackChannel_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SlackChannel_clientId_idx" ON "SlackChannel"("clientId");
CREATE INDEX "SlackChannel_slackIntegrationId_idx" ON "SlackChannel"("slackIntegrationId");

ALTER TABLE "SlackChannel"
  ADD CONSTRAINT "SlackChannel_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SlackChannel_slackIntegrationId_fkey" FOREIGN KEY ("slackIntegrationId") REFERENCES "SlackIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SlackChannel_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SlackChannelEntityFilter" (
  "id" TEXT NOT NULL,
  "slackChannelId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SlackChannelEntityFilter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SlackChannelEntityFilter_slackChannelId_entityId_key" ON "SlackChannelEntityFilter"("slackChannelId", "entityId");
CREATE INDEX "SlackChannelEntityFilter_slackChannelId_idx" ON "SlackChannelEntityFilter"("slackChannelId");
CREATE INDEX "SlackChannelEntityFilter_entityId_idx" ON "SlackChannelEntityFilter"("entityId");

ALTER TABLE "SlackChannelEntityFilter"
  ADD CONSTRAINT "SlackChannelEntityFilter_slackChannelId_fkey" FOREIGN KEY ("slackChannelId") REFERENCES "SlackChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SlackChannelEntityFilter_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CiEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
