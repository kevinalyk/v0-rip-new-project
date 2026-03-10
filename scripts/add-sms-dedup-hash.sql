ALTER TABLE "SmsQueue" ADD COLUMN IF NOT EXISTS "dedupHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "SmsQueue_dedupHash_key" ON "SmsQueue"("dedupHash") WHERE "dedupHash" IS NOT NULL;
