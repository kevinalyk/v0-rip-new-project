-- We're moving off Vercel Connect's managed Slack install (its per-workspace
-- app-install API is feature-gated) to our own Slack app + OAuth v2 flow.
-- Drop the Connect-specific installation identifier and its unique index.
DROP INDEX IF EXISTS "SlackIntegration_installationId_key";
ALTER TABLE "SlackIntegration" DROP COLUMN IF EXISTS "installationId";

-- AlterTable: store our own encrypted Slack bot token (xoxb-...) and bot user id
ALTER TABLE "SlackIntegration" ADD COLUMN "botAccessToken" TEXT;
ALTER TABLE "SlackIntegration" ADD COLUMN "botUserId" TEXT;
