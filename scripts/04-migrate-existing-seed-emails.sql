-- Migrate all existing seed emails to RIP ownership
-- This sets all current seeds as owned by RIP and available in the master pool

-- Set all existing seed emails as owned by RIP
UPDATE "SeedEmail"
SET 
    "ownedByClient" = 'RIP',
    "assignedToClient" = NULL  -- Available in master pool, not assigned yet
WHERE "ownedByClient" IS NULL;

-- Show summary of seed email ownership
SELECT 
    "ownedByClient",
    "assignedToClient",
    COUNT(*) as seed_count,
    COUNT(CASE WHEN active THEN 1 END) as active_count
FROM "SeedEmail"
GROUP BY "ownedByClient", "assignedToClient"
ORDER BY "ownedByClient", "assignedToClient";

-- Show all RIP-owned seeds
SELECT 
    id,
    email,
    provider,
    "ownedByClient",
    "assignedToClient",
    active,
    "createdAt"
FROM "SeedEmail"
WHERE "ownedByClient" = 'RIP'
ORDER BY provider, email;

SELECT 'Existing seed emails migrated to RIP ownership' as status;
