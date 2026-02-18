-- Add locked field to SeedEmail table
-- Locked seeds cannot be reassigned (client-uploaded seeds)
ALTER TABLE "SeedEmail" ADD COLUMN IF NOT EXISTS "locked" BOOLEAN NOT NULL DEFAULT false;

-- Set existing client-owned seeds as locked (any seed not owned by RIP)
UPDATE "SeedEmail" 
SET "locked" = true 
WHERE "ownedByClient" IS NOT NULL AND "ownedByClient" != 'RIP';

-- RIP-owned seeds remain unlocked (can be reassigned)
UPDATE "SeedEmail" 
SET "locked" = false 
WHERE "ownedByClient" = 'RIP' OR "ownedByClient" IS NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS "SeedEmail_locked_idx" ON "SeedEmail"("locked");
