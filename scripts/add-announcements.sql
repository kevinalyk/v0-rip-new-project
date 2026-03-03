-- Migration: Add Announcements table for What's New feature
-- Run this on your Neon database before deploying the What's New feature.

CREATE TABLE IF NOT EXISTS "Announcement" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "title"       TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "imageUrl"    TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"   TEXT NOT NULL,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Announcement_publishedAt_idx" ON "Announcement"("publishedAt" DESC);

-- Auto-update updatedAt on row modification
CREATE OR REPLACE FUNCTION update_announcement_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_announcement_updated_at ON "Announcement";
CREATE TRIGGER set_announcement_updated_at
  BEFORE UPDATE ON "Announcement"
  FOR EACH ROW EXECUTE FUNCTION update_announcement_updated_at();
