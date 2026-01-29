-- Add donationIdentifiers column to CiEntity table
-- This allows WinRed URL-based auto-assignment of campaigns to entities

ALTER TABLE "CiEntity" ADD COLUMN IF NOT EXISTS "donationIdentifiers" TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN "CiEntity"."donationIdentifiers" IS 'Comma-separated WinRed identifiers (e.g., "nrcc, crenshawforcongress") for auto-assignment';
