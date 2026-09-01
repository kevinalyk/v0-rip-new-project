-- AlterTable
ALTER TABLE "SlackIntegration" ADD COLUMN "entityFilterConfigured" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SlackEntityFilter" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlackEntityFilter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlackEntityFilter_clientId_entityId_key" ON "SlackEntityFilter"("clientId", "entityId");

-- CreateIndex
CREATE INDEX "SlackEntityFilter_clientId_idx" ON "SlackEntityFilter"("clientId");

-- CreateIndex
CREATE INDEX "SlackEntityFilter_entityId_idx" ON "SlackEntityFilter"("entityId");

-- AddForeignKey
ALTER TABLE "SlackEntityFilter" ADD CONSTRAINT "SlackEntityFilter_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackEntityFilter" ADD CONSTRAINT "SlackEntityFilter_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CiEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
