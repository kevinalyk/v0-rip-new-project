-- Add assignmentMethod and assignedAt columns to CompetitiveInsightCampaign
ALTER TABLE "CompetitiveInsightCampaign"
ADD COLUMN IF NOT EXISTS "assignmentMethod" TEXT,
ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP;

-- Add assignmentMethod and assignedAt columns to SmsQueue
ALTER TABLE "SmsQueue"
ADD COLUMN IF NOT EXISTS "assignmentMethod" TEXT,
ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_assignedAt_idx" ON "CompetitiveInsightCampaign"("assignedAt");
CREATE INDEX IF NOT EXISTS "SmsQueue_assignedAt_idx" ON "SmsQueue"("assignedAt");

-- Backfill existing assigned campaigns with 'manual' method and updatedAt as assignedAt
UPDATE "CompetitiveInsightCampaign"
SET 
  "assignmentMethod" = 'manual',
  "assignedAt" = "updatedAt"
WHERE "entityId" IS NOT NULL 
  AND "assignmentMethod" IS NULL;

-- Backfill existing assigned SMS with 'manual' method and processedAt as assignedAt
UPDATE "SmsQueue"
SET 
  "assignmentMethod" = 'manual',
  "assignedAt" = "processedAt"
WHERE "entityId" IS NOT NULL 
  AND "assignmentMethod" IS NULL;
