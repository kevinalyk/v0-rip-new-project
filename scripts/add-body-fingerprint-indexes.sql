-- Run this in the Neon console (SQL Editor) to add bodyFingerprint indexes
-- Uses md5() functional indexes because bodyFingerprint values can exceed Postgres's
-- 8191-byte B-tree limit. md5() always produces a fixed 32-char hash, so it indexes safely.
-- CONCURRENTLY means no table lock — safe to run on live traffic.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "CompetitiveInsightCampaign_bodyFingerprint_idx"
  ON "CompetitiveInsightCampaign" (md5("bodyFingerprint"));

CREATE INDEX CONCURRENTLY IF NOT EXISTS "CompetitiveInsightCampaign_bodyFingerprint_dateReceived_idx"
  ON "CompetitiveInsightCampaign" (md5("bodyFingerprint"), "dateReceived" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "SmsQueue_bodyFingerprint_idx"
  ON "SmsQueue" (md5("bodyFingerprint"));

CREATE INDEX CONCURRENTLY IF NOT EXISTS "SmsQueue_bodyFingerprint_createdAt_idx"
  ON "SmsQueue" (md5("bodyFingerprint"), "createdAt" DESC);
