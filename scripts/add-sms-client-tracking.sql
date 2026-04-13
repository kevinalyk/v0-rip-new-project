-- Add client tracking fields to SmsQueue for personal SMS attribution
-- This enables SMS to be assigned to specific clients and marked as "personal"

-- Add clientId column (nullable - not all SMS will be assigned to a client)
ALTER TABLE "SmsQueue" ADD COLUMN IF NOT EXISTS "clientId" TEXT;

-- Add source column with default "seed" (same pattern as emails)
ALTER TABLE "SmsQueue" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'seed';

-- Index for looking up SMS by client
CREATE INDEX IF NOT EXISTS "SmsQueue_clientId_idx" ON "SmsQueue"("clientId");

-- Index for filtering by source
CREATE INDEX IF NOT EXISTS "SmsQueue_source_idx" ON "SmsQueue"("source");

-- Composite index for personal SMS queries (clientId + source)
CREATE INDEX IF NOT EXISTS "SmsQueue_clientId_source_idx" ON "SmsQueue"("clientId", "source");

-- Foreign key to Client table (optional - SMS can exist without a client)
ALTER TABLE "SmsQueue" 
ADD CONSTRAINT "SmsQueue_clientId_fkey" 
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
