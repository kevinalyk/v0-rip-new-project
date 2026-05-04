-- Clear all entity images so the daily refresh cron re-fetches them.
-- Bio, office, ballotpediaUrl, and everything else stay intact.
--
-- After running:
--   - imageUrl = NULL for every entity
--   - imageUrlSource = NULL (so the cron treats them as "needs an image")
--
-- The daily refresh cron at 09:00 UTC processes 100 entities per day in
-- oldest-fetched order, so all ~700 entities will be re-imaged within
-- ~7 days. The placeholder hash check inside the cron will refuse to
-- store the "Submit Photo" silhouette or the BP-initials logo, so only
-- real headshots get saved (and locked from future updates).
--
-- The WHERE clause preserves any image you manually uploaded via the
-- admin form (imageUrlSource = 'manual'). If you haven't uploaded any
-- manual images, this is functionally equivalent to clearing everything.
--
-- Note: the cleared Blob URLs in Vercel Blob storage become orphaned.
-- That's a cosmetic storage cost, not a correctness issue.

UPDATE "CiEntity"
   SET "imageUrl" = NULL,
       "imageUrlSource" = NULL
 WHERE "imageUrl" IS NOT NULL
   AND ("imageUrlSource" IS NULL OR "imageUrlSource" <> 'manual');

-- Optional sanity check — should return 0 rows after the update completes.
-- SELECT COUNT(*) FROM "CiEntity" WHERE "imageUrl" IS NOT NULL AND "imageUrlSource" IS DISTINCT FROM 'manual';
