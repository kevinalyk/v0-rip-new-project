-- Add finalUrl field to store unwrapped/resolved URLs
-- This allows us to show both the tracking URL and the final destination

ALTER TABLE "CtaCategory" ADD COLUMN IF NOT EXISTS "finalUrl" TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS "CtaCategory_finalUrl_idx" ON "CtaCategory"("finalUrl");
