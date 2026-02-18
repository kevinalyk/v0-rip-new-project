-- Migration script to convert existing donationIdentifiers from string to JSON format
-- This converts any string format to {"winred": ["identifier1", "identifier2"]}

DO $$
DECLARE
    entity_record RECORD;
    identifiers_array TEXT[];
    json_result JSONB;
    cleaned_value TEXT;
BEGIN
    -- First, let's see what we're dealing with
    RAISE NOTICE 'Starting migration of donationIdentifiers...';
    
    -- Loop through all entities that have donationIdentifiers
    FOR entity_record IN 
        SELECT id, "donationIdentifiers"::text as donation_ids_text
        FROM "CiEntity" 
        WHERE "donationIdentifiers" IS NOT NULL
    LOOP
        BEGIN
            -- Clean the value
            cleaned_value := trim(entity_record.donation_ids_text);
            
            -- Skip if already valid JSON with expected structure
            IF cleaned_value LIKE '{"winred"%' OR cleaned_value LIKE '{"anedot"%' THEN
                RAISE NOTICE 'Entity % already migrated, skipping', entity_record.id;
                CONTINUE;
            END IF;
            
            -- Handle comma-separated string format
            IF cleaned_value LIKE '%,%' THEN
                -- Split by comma and trim
                identifiers_array := ARRAY(
                    SELECT trim(unnest(string_to_array(cleaned_value, ',')))
                );
            ELSE
                -- Single identifier
                identifiers_array := ARRAY[cleaned_value];
            END IF;
            
            -- Create JSON object with "winred" key
            json_result := jsonb_build_object('winred', to_jsonb(identifiers_array));
            
            -- Update the entity
            UPDATE "CiEntity" 
            SET "donationIdentifiers" = json_result 
            WHERE id = entity_record.id;
            
            RAISE NOTICE 'Migrated entity %: % -> %', entity_record.id, cleaned_value, json_result;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error migrating entity %: %', entity_record.id, SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE 'Migration complete!';
END $$;
