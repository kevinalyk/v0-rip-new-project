-- Add engagement tracking fields to SeedEmail table
ALTER TABLE "SeedEmail" ADD COLUMN IF NOT EXISTS "personality_type" VARCHAR(50) DEFAULT 'moderate';
ALTER TABLE "SeedEmail" ADD COLUMN IF NOT EXISTS "open_rate_target" INTEGER DEFAULT 50;
ALTER TABLE "SeedEmail" ADD COLUMN IF NOT EXISTS "reading_schedule" VARCHAR(50) DEFAULT 'business_hours';
ALTER TABLE "SeedEmail" ADD COLUMN IF NOT EXISTS "last_engagement_at" TIMESTAMP;
ALTER TABLE "SeedEmail" ADD COLUMN IF NOT EXISTS "engagement_enabled" BOOLEAN DEFAULT true;

-- Create engagement log table to track what we've done
CREATE TABLE IF NOT EXISTS "EngagementLog" (
    "id" SERIAL PRIMARY KEY,
    "seedEmailId" INTEGER NOT NULL REFERENCES "SeedEmail"("id") ON DELETE CASCADE,
    "action" VARCHAR(50) NOT NULL, -- 'open', 'move', 'delete', 'flag'
    "emailSubject" TEXT,
    "emailSender" VARCHAR(255),
    "emailReceivedAt" TIMESTAMP,
    "performedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN DEFAULT true,
    "errorMessage" TEXT
);

-- Create sender familiarity tracking
CREATE TABLE IF NOT EXISTS "SenderFamiliarity" (
    "id" SERIAL PRIMARY KEY,
    "seedEmailId" INTEGER NOT NULL REFERENCES "SeedEmail"("id") ON DELETE CASCADE,
    "senderEmail" VARCHAR(255) NOT NULL,
    "engagementCount" INTEGER DEFAULT 0,
    "lastEngagementAt" TIMESTAMP,
    "trustScore" DECIMAL(3,2) DEFAULT 0.5, -- 0.0 to 1.0
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("seedEmailId", "senderEmail")
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "idx_engagement_log_seed_email" ON "EngagementLog"("seedEmailId");
CREATE INDEX IF NOT EXISTS "idx_engagement_log_performed_at" ON "EngagementLog"("performedAt");
CREATE INDEX IF NOT EXISTS "idx_sender_familiarity_seed_email" ON "SenderFamiliarity"("seedEmailId");
