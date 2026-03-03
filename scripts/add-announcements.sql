-- Migration: Add slug column to existing Announcement table
-- Run this on your Neon database before deploying.

-- Add slug column if it doesn't already exist, defaulting to id so existing rows aren't null
ALTER TABLE "Announcement"
  ADD COLUMN IF NOT EXISTS "slug" TEXT NOT NULL DEFAULT '';

-- Backfill any existing rows: set slug = id as a safe unique placeholder
UPDATE "Announcement" SET "slug" = "id" WHERE "slug" = '';

-- Remove the default now that rows are populated
ALTER TABLE "Announcement" ALTER COLUMN "slug" DROP DEFAULT;

-- Add unique constraint if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Announcement_slug_key'
  ) THEN
    ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_slug_key" UNIQUE ("slug");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Announcement_slug_idx" ON "Announcement"("slug");
