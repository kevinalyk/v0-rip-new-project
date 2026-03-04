-- Migration: rename all entity type "politician" → "candidate"
-- Safe to run multiple times (WHERE clause is a no-op if already migrated)

UPDATE "CompetitiveInsightEntity"
SET    "type" = 'candidate'
WHERE  "type" = 'politician';
