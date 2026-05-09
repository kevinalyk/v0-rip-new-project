-- Migration: Add digestEnabled column to User table
-- Default: true (all existing users will receive the daily digest by default)
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "digestEnabled" BOOLEAN NOT NULL DEFAULT TRUE;
