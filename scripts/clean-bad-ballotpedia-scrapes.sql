-- Cleanup for entities where the cron scraped Ballotpedia disambiguation pages
-- by mistake. The telltale sign is the bio starting with "Ballotpedia features"
-- (the disambiguation page footer boilerplate) — real bios start with the
-- candidate's name. We null out the bad fields so the next cron run can retry
-- URL discovery (which will now correctly reject disambiguation pages).

-- First, see what we're about to clear (safe to run repeatedly, read-only).
SELECT id, name, "ballotpediaUrl", LEFT(bio, 80) AS bio_preview, "imageUrl"
FROM "CiEntity"
WHERE bio LIKE 'Ballotpedia features%'
   OR bio LIKE '%encyclopedic articles written and curated%';

-- Clear the bad data. Comment this out if the SELECT above shows anything
-- you want to keep.
UPDATE "CiEntity"
SET
  "ballotpediaUrl" = NULL,
  "ballotpediaFetchedAt" = NULL,
  bio = NULL,
  "imageUrl" = NULL,
  office = NULL
WHERE bio LIKE 'Ballotpedia features%'
   OR bio LIKE '%encyclopedic articles written and curated%';
