-- Create CiEntitySubscription table for tracking which clients follow which CI entities
CREATE TABLE IF NOT EXISTS "CiEntitySubscription" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "clientId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT "CiEntitySubscription_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CiEntitySubscription_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CiEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create unique index to prevent duplicate subscriptions
CREATE UNIQUE INDEX "CiEntitySubscription_clientId_entityId_key" ON "CiEntitySubscription"("clientId", "entityId");

-- Create indexes for performance
CREATE INDEX "CiEntitySubscription_clientId_idx" ON "CiEntitySubscription"("clientId");
CREATE INDEX "CiEntitySubscription_entityId_idx" ON "CiEntitySubscription"("entityId");
