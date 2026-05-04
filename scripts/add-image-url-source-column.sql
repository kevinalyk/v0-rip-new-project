-- Adds an `imageUrlSource` column to CiEntity to track whether the saved
-- imageUrl came from a Ballotpedia auto-scrape or a manual admin override.
--
-- The weekly Ballotpedia refresh cron uses this column to decide whether
-- to overwrite the image: 'ballotpedia' is fair game, 'manual' is preserved.
--
-- Per product decision: existing rows with an imageUrl set are assumed to
-- be auto-scraped (none are manually curated yet). If you've already
-- manually uploaded an image for a specific entity and want it locked,
-- update that row's imageUrlSource to 'manual' AFTER running this script.

-- 1) Add the column (nullable so existing rows without imageUrl stay null)
ALTER TABLE "CiEntity"
  ADD COLUMN IF NOT EXISTS "imageUrlSource" TEXT;

-- 2) Backfill: every row that already has an imageUrl gets flagged as
--    coming from Ballotpedia. Rows without an imageUrl stay null.
UPDATE "CiEntity"
   SET "imageUrlSource" = 'ballotpedia'
 WHERE "imageUrl" IS NOT NULL
   AND "imageUrlSource" IS NULL;

-- 3) Seed the cron state row so the first run has somewhere to upsert into.
--    Idempotent — if it already exists from a prior run, this is a no-op.
INSERT INTO "CronJobState" ("jobName", "createdAt", "updatedAt")
VALUES ('ballotpedia-refresh', NOW(), NOW())
ON CONFLICT ("jobName") DO NOTHING;
