-- Add CI Entity Management Tables
-- This script adds support for assigning competitive insight emails to entities (politicians, PACs, organizations)

-- Create CiEntity table to store standardized entities
CREATE TABLE IF NOT EXISTS "CiEntity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "type" TEXT NOT NULL, -- 'politician', 'pac', 'organization'
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Create CiEntityMapping table to map sender emails/domains to entities
CREATE TABLE IF NOT EXISTS "CiEntityMapping" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityId" TEXT NOT NULL,
  "senderEmail" TEXT,
  "senderDomain" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CiEntityMapping_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CiEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Add entityId to CompetitiveInsightCampaign table
ALTER TABLE "CompetitiveInsightCampaign" ADD COLUMN IF NOT EXISTS "entityId" TEXT;

-- Add foreign key constraint
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CompetitiveInsightCampaign_entityId_fkey'
  ) THEN
    ALTER TABLE "CompetitiveInsightCampaign" 
    ADD CONSTRAINT "CompetitiveInsightCampaign_entityId_fkey" 
    FOREIGN KEY ("entityId") REFERENCES "CiEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "CiEntityMapping_entityId_idx" ON "CiEntityMapping"("entityId");
CREATE INDEX IF NOT EXISTS "CiEntityMapping_senderEmail_idx" ON "CiEntityMapping"("senderEmail");
CREATE INDEX IF NOT EXISTS "CiEntityMapping_senderDomain_idx" ON "CiEntityMapping"("senderDomain");
CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_entityId_idx" ON "CompetitiveInsightCampaign"("entityId");
