-- Migration: Add slug column to existing Announcement table
-- Run this on your Neon database before deploying.

-- Add slug column if it doesn't already exist
ALTER TABLE "Announcement"
  ADD COLUMN IF NOT EXISTS "slug" TEXT NOT NULL DEFAULT '';

-- Backfill existing rows: generate slug from title (lowercase, spaces to hyphens, strip non-alphanumeric)
UPDATE "Announcement"
SET "slug" = regexp_replace(
  regexp_replace(lower(trim("title")), '[^a-z0-9\s-]', '', 'g'),
  '\s+', '-', 'g'
)
WHERE "slug" = '';

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
