-- Add rawHeaders column to CompetitiveInsightCampaign
ALTER TABLE "CompetitiveInsightCampaign" ADD COLUMN IF NOT EXISTS "rawHeaders" TEXT;

-- Create CIEmailCompliance table
CREATE TABLE IF NOT EXISTS "CIEmailCompliance" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    
    -- Section 1: All Senders
    "hasSpf" BOOLEAN,
    "hasDkim" BOOLEAN,
    "hasTls" BOOLEAN,
    "hasValidMessageId" BOOLEAN,
    "notImpersonatingGmail" BOOLEAN,
    "hasArcHeaders" BOOLEAN,
    
    -- Section 2: Bulk Senders
    "hasBothSpfAndDkim" BOOLEAN,
    "hasDmarc" BOOLEAN,
    "hasDmarcAlignment" BOOLEAN,
    "hasOneClickUnsubscribeHeaders" BOOLEAN,
    "hasUnsubscribeLinkInBody" BOOLEAN,
    
    -- Section 3: Content
    "hasSingleFromAddress" BOOLEAN,
    "noFakeReplyPrefix" BOOLEAN,
    "hasValidFromTo" BOOLEAN,
    "noDeceptiveEmojisInSubject" BOOLEAN,
    "noHiddenContent" BOOLEAN,
    
    -- Section 4: Display Name
    "displayNameClean" BOOLEAN,
    "displayNameNoRecipient" BOOLEAN,
    "displayNameNoReplyPattern" BOOLEAN,
    "displayNameNoDeceptiveEmojis" BOOLEAN,
    "displayNameNotGmail" BOOLEAN,
    
    -- Scores (0.0 - 1.0)
    "section1Score" DOUBLE PRECISION,
    "section2Score" DOUBLE PRECISION,
    "section3Score" DOUBLE PRECISION,
    "section4Score" DOUBLE PRECISION,
    "totalScore" DOUBLE PRECISION,
    
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CIEmailCompliance_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint on campaignId
ALTER TABLE "CIEmailCompliance" ADD CONSTRAINT "CIEmailCompliance_campaignId_key" UNIQUE ("campaignId");

-- Add foreign key constraint
ALTER TABLE "CIEmailCompliance" ADD CONSTRAINT "CIEmailCompliance_campaignId_fkey" 
    FOREIGN KEY ("campaignId") REFERENCES "CompetitiveInsightCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create indexes
CREATE INDEX IF NOT EXISTS "CIEmailCompliance_campaignId_idx" ON "CIEmailCompliance"("campaignId");
CREATE INDEX IF NOT EXISTS "CIEmailCompliance_totalScore_idx" ON "CIEmailCompliance"("totalScore");
