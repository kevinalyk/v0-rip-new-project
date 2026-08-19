-- AlterTable: teamId is not known until the Slack OAuth flow completes, so it must be nullable
ALTER TABLE "SlackIntegration" ALTER COLUMN "teamId" DROP NOT NULL;

-- AlterTable: track Vercel Connect's per-workspace installation identifier for the shared connector
ALTER TABLE "SlackIntegration" ADD COLUMN "installationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SlackIntegration_installationId_key" ON "SlackIntegration"("installationId");
