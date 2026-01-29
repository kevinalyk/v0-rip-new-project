-- Add assignedToClientId column to Domain table
ALTER TABLE "Domain" ADD COLUMN IF NOT EXISTS "assignedToClientId" TEXT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS "Domain_assignedToClientId_idx" ON "Domain"("assignedToClientId");

-- Add foreign key constraint
ALTER TABLE "Domain" 
ADD CONSTRAINT "Domain_assignedToClientId_fkey" 
FOREIGN KEY ("assignedToClientId") 
REFERENCES "Client"("id") 
ON DELETE SET NULL 
ON UPDATE CASCADE;

-- Backfill existing domains with client assignments based on their campaigns
-- For each domain, assign it to the client that has campaigns using that domain
UPDATE "Domain" d
SET "assignedToClientId" = (
  SELECT c."assignedToClientId"
  FROM "Campaign" c
  WHERE c."domainId" = d.id
    AND c."assignedToClientId" IS NOT NULL
  LIMIT 1
)
WHERE d."assignedToClientId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "Campaign" c 
    WHERE c."domainId" = d.id 
      AND c."assignedToClientId" IS NOT NULL
  );
