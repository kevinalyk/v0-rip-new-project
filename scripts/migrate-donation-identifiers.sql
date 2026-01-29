-- Migration script to convert existing donationIdentifiers from string to JSON format
-- This converts "nrcc, crenshawforcongress" to {"winred": ["nrcc", "crenshawforcongress"]}

DO $$
DECLARE
    entity_record RECORD;
    identifiers_array TEXT[];
    json_result JSONB;
BEGIN
    -- Loop through all entities that have donationIdentifiers
    FOR entity_record IN 
        SELECT id, "donationIdentifiers" 
        FROM "CiEntity" 
        WHERE "donationIdentifiers" IS NOT NULL 
        AND "donationIdentifiers" != ''
    LOOP
        -- Split comma-separated values into array and trim whitespace
        identifiers_array := string_to_array(entity_record."donationIdentifiers", ',');
        
        -- Trim each element
        FOR i IN 1..array_length(identifiers_array, 1) LOOP
            identifiers_array[i] := trim(identifiers_array[i]);
        END LOOP;
        
        -- Create JSON object with "winred" key containing array of identifiers
        json_result := jsonb_build_object('winred', array_to_json(identifiers_array));
        
        -- Update the entity with new JSON format
        UPDATE "CiEntity" 
        SET "donationIdentifiers" = json_result 
        WHERE id = entity_record.id;
        
        RAISE NOTICE 'Migrated entity % with identifiers: %', entity_record.id, json_result;
    END LOOP;
    
    RAISE NOTICE 'Migration complete!';
END $$;
