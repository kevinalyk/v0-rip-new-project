-- Step 1: Create domain settings for existing domains with their current dataRetentionDays
INSERT INTO "DomainSetting" (id, "domainId", key, value, "createdAt", "updatedAt")
SELECT 
    gen_random_uuid() as id,
    d.id as "domainId",
    'retention_period' as key,
    d."dataRetentionDays"::text as value,
    NOW() as "createdAt",
    NOW() as "updatedAt"
FROM "Domain" d
WHERE NOT EXISTS (
    SELECT 1 FROM "DomainSetting" ds 
    WHERE ds."domainId" = d.id AND ds.key = 'retention_period'
);

-- Step 2: Remove the dataRetentionDays column from Domain table
ALTER TABLE "Domain" DROP COLUMN IF EXISTS "dataRetentionDays";
