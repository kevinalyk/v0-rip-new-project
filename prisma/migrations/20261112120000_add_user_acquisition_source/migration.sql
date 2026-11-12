ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "acquisitionSource" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "acquisitionRef" TEXT;

CREATE INDEX IF NOT EXISTS "User_acquisitionSource_idx" ON "User"("acquisitionSource");
