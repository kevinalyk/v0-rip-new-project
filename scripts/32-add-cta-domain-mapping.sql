-- Add ctaDomain field to CiEntityMapping for URL-based catch-all entity assignment
ALTER TABLE "CiEntityMapping" ADD COLUMN IF NOT EXISTS "ctaDomain" TEXT;

-- Index for fast lookup during auto-assign cron
CREATE INDEX IF NOT EXISTS "CiEntityMapping_ctaDomain_idx" ON "CiEntityMapping"("ctaDomain");
