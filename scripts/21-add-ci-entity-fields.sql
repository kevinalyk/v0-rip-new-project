-- Add party and state fields to CiEntity table
ALTER TABLE "CiEntity" ADD COLUMN IF NOT EXISTS "party" TEXT;
ALTER TABLE "CiEntity" ADD COLUMN IF NOT EXISTS "state" TEXT;

-- Add index for party filtering
CREATE INDEX IF NOT EXISTS "CiEntity_party_idx" ON "CiEntity"("party");

-- Add index for state filtering
CREATE INDEX IF NOT EXISTS "CiEntity_state_idx" ON "CiEntity"("state");

-- Update existing entities to have NULL values (can be filled in later)
-- No data migration needed as these are new optional fields
