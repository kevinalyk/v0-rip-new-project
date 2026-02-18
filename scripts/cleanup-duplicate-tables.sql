-- Remove the duplicate lowercase tables I accidentally created
DROP TABLE IF EXISTS "email_deliveries";
DROP TABLE IF EXISTS "campaigns";

-- Verify the correct Pascal case tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('User', 'SeedEmail', 'Campaign', 'Result', 'Setting', 'EmailQueue', 'EmailContent')
ORDER BY table_name;
