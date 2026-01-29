-- Check what tables currently exist in your database
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Check the structure of existing tables
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name IN ('User', 'users', 'SeedEmail', 'seed_emails', 'Campaign', 'campaigns')
ORDER BY table_name, ordinal_position;
