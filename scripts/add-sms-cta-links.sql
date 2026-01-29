-- Add ctaLinks field to SmsQueue table to store extracted links from SMS messages
ALTER TABLE "SmsQueue" ADD COLUMN "ctaLinks" JSONB;

-- Add index for querying by ctaLinks
CREATE INDEX IF NOT EXISTS "SmsQueue_ctaLinks_idx" ON "SmsQueue" USING gin("ctaLinks");
