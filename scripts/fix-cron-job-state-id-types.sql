-- Fix CronJobState to use String/TEXT for both lastProcessedEmailId and lastProcessedSmsId
-- Both campaigns and SMS use cuid/String IDs
-- Drop and recreate the table with correct types

DROP TABLE IF EXISTS "CronJobState";

CREATE TABLE "CronJobState" (
  "id" SERIAL PRIMARY KEY,
  "jobName" TEXT UNIQUE NOT NULL,
  "lastProcessedEmailId" TEXT,
  "lastProcessedSmsId" TEXT,
  "lastRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "CronJobState_jobName_idx" ON "CronJobState"("jobName");
