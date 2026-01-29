-- Add tag field to CiEntity table for state/district information
-- This allows free-text tags like "Rep DM Ind", "Sen CA", etc.

ALTER TABLE "CiEntity" ADD COLUMN IF NOT EXISTS "tag" TEXT;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS "CiEntity_tag_idx" ON "CiEntity"("tag");
