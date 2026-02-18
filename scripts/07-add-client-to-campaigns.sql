-- Add assignedToClient column to campaigns table
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "assignedToClientId" TEXT;

-- Migrate all existing campaigns to Red Spark Strategy
UPDATE "Campaign" SET assignedToClient = 'red_spark_strategy';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS "Campaign_assignedToClientId_idx" ON "Campaign"("assignedToClientId");
