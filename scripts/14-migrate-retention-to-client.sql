-- Migration: Move retention period from domain-level to client-level
-- This script migrates existing domain retention periods to client retention periods

-- Step 1: Update clients with retention periods from their first domain
-- For each client, take the retention period from their first domain (if any)
UPDATE "Client" c
SET "dataRetentionDays" = COALESCE(
  (
    SELECT ds."retentionPeriod"
    FROM "Domain" d
    LEFT JOIN "DomainSetting" ds ON d.id = ds."domainId"
    WHERE d."assignedToClientId" = c.id
    AND ds."retentionPeriod" IS NOT NULL
    ORDER BY d."createdAt" ASC
    LIMIT 1
  ),
  90 -- Default to 90 days if no domain settings exist
);

-- Step 2: Drop the DomainSetting table since we no longer need domain-level settings
-- All settings are now at the client level
DROP TABLE IF EXISTS "DomainSetting";
