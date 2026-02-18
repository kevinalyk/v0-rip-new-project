-- Add summaryData field to Campaign table
ALTER TABLE "Campaign" 
ADD COLUMN "summaryData" TEXT;

-- Add comment for documentation
COMMENT ON COLUMN "Campaign"."summaryData" IS 'JSON field storing provider breakdown summary (gmail, outlook, yahoo stats)';

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'Campaign' 
AND column_name = 'summaryData';
