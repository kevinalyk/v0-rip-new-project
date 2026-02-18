-- Add Campaign table to match existing schema structure
CREATE TABLE IF NOT EXISTS "Campaign" (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    sender TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "deliveryRate" DOUBLE PRECISION DEFAULT 0,
    "sentDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    description TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);

-- Add EmailDelivery table to match existing schema structure  
CREATE TABLE IF NOT EXISTS "EmailDelivery" (
    id TEXT PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "seedEmailId" TEXT NOT NULL,
    delivered BOOLEAN DEFAULT FALSE,
    "inInbox" BOOLEAN DEFAULT FALSE,
    "inSpam" BOOLEAN DEFAULT FALSE,
    headers JSONB,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailDelivery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"(id) ON DELETE CASCADE,
    CONSTRAINT "EmailDelivery_seedEmailId_fkey" FOREIGN KEY ("seedEmailId") REFERENCES "SeedEmail"(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "EmailDelivery_campaignId_idx" ON "EmailDelivery"("campaignId");
CREATE INDEX IF NOT EXISTS "EmailDelivery_seedEmailId_idx" ON "EmailDelivery"("seedEmailId");
