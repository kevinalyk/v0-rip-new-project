DROP INDEX IF EXISTS "User_acquisitionSource_idx";
ALTER TABLE "User" DROP COLUMN IF EXISTS "acquisitionRef";
ALTER TABLE "User" DROP COLUMN IF EXISTS "acquisitionSource";
