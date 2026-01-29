-- Fix malformed donationIdentifiers JSON data
-- This handles triple-escaped JSON strings and normalizes all formats

DO $$
DECLARE
    entity_record RECORD;
    cleaned_json JSONB;
    raw_text TEXT;
BEGIN
    RAISE NOTICE 'Starting donationIdentifiers cleanup...';
    
    FOR entity_record IN 
        SELECT id, name, "donationIdentifiers"
        FROM "CiEntity"
        WHERE "donationIdentifiers" IS NOT NULL
    LOOP
        BEGIN
            -- Convert to text to inspect the raw value
            raw_text := entity_record."donationIdentifiers"::TEXT;
            
            -- Try to parse as JSON directly first
            BEGIN
                cleaned_json := entity_record."donationIdentifiers"::JSONB;
                RAISE NOTICE 'Entity % (%): Already valid JSON', entity_record.name, entity_record.id;
                CONTINUE;
            EXCEPTION WHEN OTHERS THEN
                -- Not valid JSON, needs cleaning
                NULL;
            END;
            
            -- Remove triple escaping: """{\""winred\"":[\""value\""]}""" -> {"winred":["value"]}
            raw_text := REPLACE(raw_text, '\"', '"');
            raw_text := TRIM(BOTH '"' FROM raw_text);
            
            -- Try to parse the cleaned text as JSON
            cleaned_json := raw_text::JSONB;
            
            -- Update the record with cleaned JSON
            UPDATE "CiEntity"
            SET "donationIdentifiers" = cleaned_json
            WHERE id = entity_record.id;
            
            RAISE NOTICE 'Entity % (%): Fixed malformed JSON', entity_record.name, entity_record.id;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Entity % (%): Could not fix - Error: %', 
                entity_record.name, entity_record.id, SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE 'Cleanup complete!';
END $$;

-- Verify results
SELECT 
    COUNT(*) as total_entities_with_identifiers,
    COUNT(CASE WHEN "donationIdentifiers"::TEXT LIKE '%winred%' THEN 1 END) as with_winred,
    COUNT(CASE WHEN "donationIdentifiers"::TEXT LIKE '%anedot%' THEN 1 END) as with_anedot
FROM "CiEntity"
WHERE "donationIdentifiers" IS NOT NULL;
