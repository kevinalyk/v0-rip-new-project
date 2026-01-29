-- Add Nonprofit as a valid entity type
-- This updates the documentation comment for the CiEntity type column

-- Update the comment to document the new entity type
COMMENT ON COLUMN "CiEntity"."type" IS 'Entity type: politician, pac, organization, data_broker, nonprofit';

-- Optional: If you want to enforce entity types at the database level with a CHECK constraint,
-- uncomment the following lines:

-- ALTER TABLE "CiEntity" DROP CONSTRAINT IF EXISTS "CiEntity_type_check";
-- ALTER TABLE "CiEntity" ADD CONSTRAINT "CiEntity_type_check" 
--   CHECK ("type" IN ('politician', 'pac', 'organization', 'data_broker', 'nonprofit'));
