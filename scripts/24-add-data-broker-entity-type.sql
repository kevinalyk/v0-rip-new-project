-- Add Data Broker as a valid entity type
-- This script is optional - the database already supports any text value for the type field
-- This is just for documentation and to add a check constraint if desired

-- Add a comment to document the new entity type
COMMENT ON COLUMN "CiEntity"."type" IS 'Entity type: politician, pac, organization, data_broker';

-- Optional: Add a check constraint to enforce valid entity types
-- Uncomment the following lines if you want to enforce entity types at the database level

-- ALTER TABLE "CiEntity" DROP CONSTRAINT IF EXISTS "CiEntity_type_check";
-- ALTER TABLE "CiEntity" ADD CONSTRAINT "CiEntity_type_check" 
--   CHECK ("type" IN ('politician', 'pac', 'organization', 'data_broker'));
