-- Add Personal Email Feature for @realdailyreview.com
-- Description: Adds clientId tracking to campaigns so clients can subscribe using their unique email

-- Add clientId and source columns to CompetitiveInsightCampaign
ALTER TABLE "CompetitiveInsightCampaign" 
ADD COLUMN IF NOT EXISTS "clientId" TEXT,
ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'seed';

-- Update existing campaigns to have 'seed' source
UPDATE "CompetitiveInsightCampaign" 
SET "source" = 'seed' 
WHERE "source" IS NULL;

-- Add foreign key constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CompetitiveInsightCampaign_clientId_fkey'
    ) THEN
        ALTER TABLE "CompetitiveInsightCampaign" 
        ADD CONSTRAINT "CompetitiveInsightCampaign_clientId_fkey" 
        FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL;
    END IF;
END $$;

-- Create indexes for filtering
CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_source_idx" 
ON "CompetitiveInsightCampaign"("source");

CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_clientId_idx" 
ON "CompetitiveInsightCampaign"("clientId");

-- Verify changes
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'CompetitiveInsightCampaign' 
AND column_name IN ('clientId', 'source')
ORDER BY column_name;
