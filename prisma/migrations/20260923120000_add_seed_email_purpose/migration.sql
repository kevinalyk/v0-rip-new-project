-- Add an optional free-text "purpose" label to seed emails so admins can
-- track what a seed is being used for (e.g. "CI", "Personal", "Domain Health").
ALTER TABLE "SeedEmail" ADD COLUMN "purpose" TEXT;
