-- Add clickedUrl column to EngagementLog for tracking which link was clicked
ALTER TABLE "EngagementLog" ADD COLUMN "clickedUrl" TEXT;

-- Add action index for fast filtering by action type (open/click/reply)
CREATE INDEX IF NOT EXISTS "EngagementLog_action_idx" ON "EngagementLog"("action");

-- Add click_rate_target to SeedEmail: per-seed probability of clicking links (0-100, like open_rate_target)
-- Defaults to 0 so existing seeds opt-out until explicitly initialized by the cron
ALTER TABLE "SeedEmail" ADD COLUMN IF NOT EXISTS "click_rate_target" INTEGER NOT NULL DEFAULT 0;

-- Add last_click_at to SeedEmail for tracking when a seed last clicked a link
ALTER TABLE "SeedEmail" ADD COLUMN IF NOT EXISTS "last_click_at" TIMESTAMP;
