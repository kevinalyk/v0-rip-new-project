-- Frozen "Google verified" snapshot columns, needed to compare delivery results
-- before/after the Sept 8 Google bulk-sender requirements rollout without history
-- being rewritten if a domain's live verified status changes later.

-- DomainHealthEmailSample: always has a clientDomainId, so snapshot is non-nullable.
ALTER TABLE "DomainHealthEmailSample"
  ADD COLUMN "googleVerifiedSnapshot" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "DomainHealthEmailSample_googleVerifiedSnapshot_idx"
  ON "DomainHealthEmailSample" ("googleVerifiedSnapshot");

-- Backfill existing rows from their linked ClientDomain's current googleVerified value.
-- This is a best-effort backfill only — new rows going forward are frozen at ingestion time.
UPDATE "DomainHealthEmailSample" AS s
SET "googleVerifiedSnapshot" = cd."googleVerified"
FROM "ClientDomain" AS cd
WHERE cd.id = s."clientDomainId";

-- CompetitiveInsightCampaign: sender domain may not match any tracked ClientDomain, so
-- the snapshot is nullable (null = unknown / unmatched domain).
ALTER TABLE "CompetitiveInsightCampaign"
  ADD COLUMN "googleVerifiedSnapshot" BOOLEAN;

CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_googleVerifiedSnapshot_idx"
  ON "CompetitiveInsightCampaign" ("googleVerifiedSnapshot");
