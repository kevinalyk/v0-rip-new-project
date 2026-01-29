-- Step 1: Drop the old DomainSetting table if it exists
DROP TABLE IF EXISTS "DomainSetting";

-- Step 2: Create the new DomainSetting table with columns for each setting
CREATE TABLE "DomainSetting" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "retentionPeriod" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainSetting_pkey" PRIMARY KEY ("id")
);

-- Step 3: Create unique constraint on domainId (one setting record per domain)
CREATE UNIQUE INDEX "DomainSetting_domainId_key" ON "DomainSetting"("domainId");

-- Step 4: Add foreign key constraint
ALTER TABLE "DomainSetting" ADD CONSTRAINT "DomainSetting_domainId_fkey" 
    FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 5: Create default settings for all existing domains
INSERT INTO "DomainSetting" ("id", "domainId", "retentionPeriod", "createdAt", "updatedAt")
SELECT 
    'cluid_' || substr(md5(random()::text), 1, 25) as id,
    d.id as "domainId",
    90 as "retentionPeriod",
    CURRENT_TIMESTAMP as "createdAt",
    CURRENT_TIMESTAMP as "updatedAt"
FROM "Domain" d
WHERE d.id NOT IN (
    SELECT "domainId" FROM "DomainSetting" WHERE "domainId" IS NOT NULL
);

-- Step 6: Remove the old dataRetentionDays column from Setting table if it exists
-- (This assumes you had it there before, adjust if needed)
-- DELETE FROM "Setting" WHERE key = 'dataRetentionDays';

COMMIT;
