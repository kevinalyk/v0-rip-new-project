-- Drop the position column from CiEntity table
-- This removes the position field that was previously added

ALTER TABLE "CiEntity" DROP COLUMN IF EXISTS "position";
