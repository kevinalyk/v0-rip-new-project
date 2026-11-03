-- Rollback for 20261103120000_add_product_scoping.
-- Drops all Brand-created content/rows flagged product = 'brand' along with the columns, so only run this
-- before Brand has written anything to these tables.

DROP TABLE IF EXISTS "BrandPasswordResetToken";

DROP INDEX IF EXISTS "Client_product_idx";
DROP INDEX IF EXISTS "TrialCode_product_idx";
DROP INDEX IF EXISTS "Announcement_product_idx";
DROP INDEX IF EXISTS "DigestArticle_product_idx";
DROP INDEX IF EXISTS "Changelog_product_idx";

ALTER TABLE "Client"          DROP COLUMN IF EXISTS "product";
ALTER TABLE "TrialCode"       DROP COLUMN IF EXISTS "product";
ALTER TABLE "Announcement"    DROP COLUMN IF EXISTS "product";
ALTER TABLE "DigestArticle"   DROP COLUMN IF EXISTS "product";
ALTER TABLE "Changelog"       DROP COLUMN IF EXISTS "product";
ALTER TABLE "SiteVisit"       DROP COLUMN IF EXISTS "product";
ALTER TABLE "EmailClickEvent" DROP COLUMN IF EXISTS "product";
