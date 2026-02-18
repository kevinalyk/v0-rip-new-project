-- Add share link functionality to SmsQueue
ALTER TABLE "SmsQueue"
ADD COLUMN IF NOT EXISTS "shareToken" TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS "shareTokenCreatedAt" TIMESTAMP,
ADD COLUMN IF NOT EXISTS "shareCount" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "shareViewCount" INTEGER DEFAULT 0;

-- Create index for faster share token lookups
CREATE INDEX IF NOT EXISTS "SmsQueue_shareToken_idx" ON "SmsQueue"("shareToken");
