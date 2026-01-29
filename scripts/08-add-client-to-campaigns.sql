-- Add assignedToClientId column to Campaign table to link campaigns to clients
-- This allows filtering campaigns by client organization

-- Add the column (nullable to allow existing campaigns)
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "assignedToClientId" TEXT;

-- Create index for better query performance when filtering by client
CREATE INDEX IF NOT EXISTS "Campaign_assignedToClientId_idx" ON "Campaign"("assignedToClientId");

-- Optional: Migrate existing campaigns to a default client if one exists
-- Uncomment and modify the client ID below if you want to assign existing campaigns
-- UPDATE "Campaign" SET "assignedToClientId" = 'your_client_id_here' WHERE "assignedToClientId" IS NULL;

-- Display current campaigns and their client assignments
SELECT 
    id,
    subject,
    sender,
    "sentDate",
    "assignedToClientId",
    "domainId"
FROM "Campaign"
ORDER BY "sentDate" DESC
LIMIT 10;
