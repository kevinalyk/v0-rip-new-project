-- Run this in the Neon console (SQL Editor) to add bodyFingerprint indexes
-- CONCURRENTLY means no table lock — safe to run on live traffic

CREATE INDEX CONCURRENTLY IF NOT EXISTS "CompetitiveInsightCampaign_bodyFingerprint_idx"
  ON "CompetitiveInsightCampaign" ("bodyFingerprint");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "CompetitiveInsightCampaign_bodyFingerprint_dateReceived_idx"
  ON "CompetitiveInsightCampaign" ("bodyFingerprint", "dateReceived" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "SmsQueue_bodyFingerprint_idx"
  ON "SmsQueue" ("bodyFingerprint");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "SmsQueue_bodyFingerprint_createdAt_idx"
  ON "SmsQueue" ("bodyFingerprint", "createdAt" DESC);
