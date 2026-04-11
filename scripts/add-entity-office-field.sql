-- Add office field to CiEntity for Ballotpedia-scraped office/title info
ALTER TABLE "CiEntity" ADD COLUMN IF NOT EXISTS "office" TEXT;
