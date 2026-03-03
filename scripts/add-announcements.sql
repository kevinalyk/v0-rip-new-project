-- Migration: Add Announcements table for What's New / News feature
-- Run this on your Neon database before deploying.

CREATE TABLE IF NOT EXISTS "Announcement" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "slug"        TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "imageUrl"    TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"   TEXT NOT NULL,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Announcement_slug_key" UNIQUE ("slug")
);

CREATE INDEX IF NOT EXISTS "Announcement_publishedAt_idx" ON "Announcement"("publishedAt" DESC);
CREATE INDEX IF NOT EXISTS "Announcement_slug_idx" ON "Announcement"("slug");

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
