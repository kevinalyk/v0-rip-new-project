-- Product scoping for the shared RIP / Brand database.
-- Adds a "product" discriminator ('rip' default, 'brand') and a Brand password-reset token table.
-- Additive and idempotent; every existing row becomes 'rip'. Constant defaults on Postgres 11+
-- are metadata-only, so this does not rewrite the large tables.

ALTER TABLE "Client"         ADD COLUMN IF NOT EXISTS "product" TEXT NOT NULL DEFAULT 'rip';
ALTER TABLE "TrialCode"      ADD COLUMN IF NOT EXISTS "product" TEXT NOT NULL DEFAULT 'rip';
ALTER TABLE "Announcement"   ADD COLUMN IF NOT EXISTS "product" TEXT NOT NULL DEFAULT 'rip';
ALTER TABLE "DigestArticle"  ADD COLUMN IF NOT EXISTS "product" TEXT NOT NULL DEFAULT 'rip';
ALTER TABLE "Changelog"      ADD COLUMN IF NOT EXISTS "product" TEXT NOT NULL DEFAULT 'rip';
ALTER TABLE "SiteVisit"      ADD COLUMN IF NOT EXISTS "product" TEXT NOT NULL DEFAULT 'rip';
ALTER TABLE "EmailClickEvent" ADD COLUMN IF NOT EXISTS "product" TEXT NOT NULL DEFAULT 'rip';

-- No product index on SiteVisit / EmailClickEvent: write-heavy and nothing filters on them by index yet.
CREATE INDEX IF NOT EXISTS "Client_product_idx"        ON "Client"("product");
CREATE INDEX IF NOT EXISTS "TrialCode_product_idx"     ON "TrialCode"("product");
CREATE INDEX IF NOT EXISTS "Announcement_product_idx"  ON "Announcement"("product");
CREATE INDEX IF NOT EXISTS "DigestArticle_product_idx" ON "DigestArticle"("product");
CREATE INDEX IF NOT EXISTS "Changelog_product_idx"     ON "Changelog"("product");

CREATE TABLE IF NOT EXISTS "BrandPasswordResetToken" (
  "id"          TEXT         NOT NULL,
  "tokenHash"   TEXT         NOT NULL,
  "brandUserId" TEXT         NOT NULL,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "usedAt"      TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrandPasswordResetToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BrandPasswordResetToken_brandUserId_fkey"
    FOREIGN KEY ("brandUserId") REFERENCES "BrandUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "BrandPasswordResetToken_tokenHash_key" ON "BrandPasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "BrandPasswordResetToken_brandUserId_idx" ON "BrandPasswordResetToken"("brandUserId");
CREATE INDEX IF NOT EXISTS "BrandPasswordResetToken_expiresAt_idx"   ON "BrandPasswordResetToken"("expiresAt");
