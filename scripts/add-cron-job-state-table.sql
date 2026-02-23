-- Create table to store cron job state for cursor-based pagination
CREATE TABLE IF NOT EXISTS "CronJobState" (
    "id" SERIAL PRIMARY KEY,
    "jobName" TEXT NOT NULL UNIQUE,
    "lastProcessedEmailId" INTEGER,
    "lastProcessedSmsId" INTEGER,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index on jobName for faster lookups
CREATE INDEX IF NOT EXISTS "CronJobState_jobName_idx" ON "CronJobState"("jobName");

-- Insert initial state for unwrap-links job
INSERT INTO "CronJobState" ("jobName", "lastProcessedEmailId", "lastProcessedSmsId")
VALUES ('unwrap-links', NULL, NULL)
ON CONFLICT ("jobName") DO NOTHING;

-- Add comment
COMMENT ON TABLE "CronJobState" IS 'Stores cursor state for cron jobs to enable incremental processing';
