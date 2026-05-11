-- Migration 34: Add weeklyDigestEnabled to User table
-- All existing users default to true (opted in).
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "weeklyDigestEnabled" BOOLEAN NOT NULL DEFAULT true;
