-- Fix CronJobState to use String for lastProcessedEmailId (campaigns use cuid/String IDs)
-- Drop and recreate the table with correct types

DROP TABLE IF EXISTS "CronJobState";

CREATE TABLE "CronJobState" (
  "id" SERIAL PRIMARY KEY,
  "jobName" TEXT UNIQUE NOT NULL,
  "lastProcessedEmailId" TEXT,
  "lastProcessedSmsId" INTEGER,
  "lastRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "CronJobState_jobName_idx" ON "CronJobState"("jobName");
