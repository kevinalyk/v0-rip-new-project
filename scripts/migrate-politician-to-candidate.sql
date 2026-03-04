-- Migration: rename all entity type "politician" -> "candidate"
-- Safe to run multiple times (idempotent).

BEGIN;

UPDATE "CIEntity"
SET "type" = 'candidate'
WHERE "type" = 'politician';

-- Confirm how many rows were updated
SELECT COUNT(*) AS total_candidates
FROM "CIEntity"
WHERE "type" = 'candidate';

COMMIT;
