-- Create SmsQueue table for receiving SMS webhooks from FullStack
CREATE TABLE IF NOT EXISTS "SmsQueue" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "rawData" TEXT NOT NULL,
  "processed" BOOLEAN NOT NULL DEFAULT false,
  "processingAttempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "phoneNumber" TEXT,
  "toNumber" TEXT,
  "message" TEXT,
  "campaignId" TEXT,
  "companyId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "SmsQueue_phoneNumber_idx" ON "SmsQueue"("phoneNumber");
CREATE INDEX IF NOT EXISTS "SmsQueue_toNumber_idx" ON "SmsQueue"("toNumber");
CREATE INDEX IF NOT EXISTS "SmsQueue_processed_idx" ON "SmsQueue"("processed");
CREATE INDEX IF NOT EXISTS "SmsQueue_createdAt_idx" ON "SmsQueue"("createdAt");
