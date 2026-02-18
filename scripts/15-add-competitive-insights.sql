-- Create CompetitiveInsightCampaign table for tracking political campaigns
CREATE TABLE IF NOT EXISTS "CompetitiveInsightCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "senderName" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "dateReceived" TIMESTAMP(3) NOT NULL,
    "inboxCount" INTEGER NOT NULL DEFAULT 0,
    "spamCount" INTEGER NOT NULL DEFAULT 0,
    "notDeliveredCount" INTEGER NOT NULL DEFAULT 0,
    "inboxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctaLinks" JSONB,
    "tags" JSONB,
    "emailPreview" TEXT,
    "emailContent" TEXT,
    "resultIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create unique constraint to prevent duplicate campaigns (same sender + subject)
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_senderEmail_subject_key" 
ON "CompetitiveInsightCampaign"("senderEmail", "subject");

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_senderEmail_idx" 
ON "CompetitiveInsightCampaign"("senderEmail");

CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_subject_idx" 
ON "CompetitiveInsightCampaign"("subject");

CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_dateReceived_idx" 
ON "CompetitiveInsightCampaign"("dateReceived");

CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_inboxRate_idx" 
ON "CompetitiveInsightCampaign"("inboxRate");
