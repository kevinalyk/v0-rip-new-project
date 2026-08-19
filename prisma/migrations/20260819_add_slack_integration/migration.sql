-- CreateTable
CREATE TABLE "SlackIntegration" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamName" TEXT,
    "channelId" TEXT,
    "channelName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "connectedByUserId" TEXT,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlackIntegration_clientId_key" ON "SlackIntegration"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "SlackIntegration_teamId_key" ON "SlackIntegration"("teamId");

-- CreateIndex
CREATE INDEX "SlackIntegration_teamId_idx" ON "SlackIntegration"("teamId");

-- AddForeignKey
ALTER TABLE "SlackIntegration" ADD CONSTRAINT "SlackIntegration_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackIntegration" ADD CONSTRAINT "SlackIntegration_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
