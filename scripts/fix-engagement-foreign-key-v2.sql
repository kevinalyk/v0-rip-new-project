-- Fix the foreign key constraint issue for EngagementLog table
-- The SeedEmail.id column is VARCHAR/TEXT, not INTEGER

-- Drop the existing tables if they exist (since they have the wrong constraint)
DROP TABLE IF EXISTS "EngagementLog";
DROP TABLE IF EXISTS "SenderFamiliarity";

-- Recreate EngagementLog with proper VARCHAR foreign key reference
-- Using VARCHAR to match SeedEmail.id column type
CREATE TABLE "EngagementLog" (
    "id" SERIAL PRIMARY KEY,
    "seedEmailId" VARCHAR(255) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "emailSubject" TEXT,
    "emailSender" VARCHAR(255),
    "emailReceivedAt" TIMESTAMP,
    "performedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN DEFAULT true,
    "errorMessage" TEXT,
    CONSTRAINT "EngagementLog_seedEmailId_fkey" 
        FOREIGN KEY ("seedEmailId") 
        REFERENCES "SeedEmail"("id") 
        ON DELETE CASCADE
);

-- Recreate SenderFamiliarity with proper VARCHAR foreign key reference
CREATE TABLE "SenderFamiliarity" (
    "id" SERIAL PRIMARY KEY,
    "seedEmailId" VARCHAR(255) NOT NULL,
    "senderEmail" VARCHAR(255) NOT NULL,
    "engagementCount" INTEGER DEFAULT 0,
    "lastEngagementAt" TIMESTAMP,
    "trustScore" DECIMAL(3,2) DEFAULT 0.5,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SenderFamiliarity_seedEmailId_fkey" 
        FOREIGN KEY ("seedEmailId") 
        REFERENCES "SeedEmail"("id") 
        ON DELETE CASCADE,
    CONSTRAINT "SenderFamiliarity_unique_seed_sender" 
        UNIQUE("seedEmailId", "senderEmail")
);

-- Add indexes for performance
CREATE INDEX "idx_engagement_log_seed_email" ON "EngagementLog"("seedEmailId");
CREATE INDEX "idx_engagement_log_performed_at" ON "EngagementLog"("performedAt");
CREATE INDEX "idx_sender_familiarity_seed_email" ON "SenderFamiliarity"("seedEmailId");
