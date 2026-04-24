-- Migration: Add UnsubDomainMapping table and unsubDomain column on campaigns
-- Tier 2 of the 3-tier sending provider resolution system

-- 1. Add unsubDomain column to store the extracted List-Unsubscribe domain
ALTER TABLE "CompetitiveInsightCampaign"
  ADD COLUMN IF NOT EXISTS "unsubDomain" TEXT;

CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_unsubDomain_idx"
  ON "CompetitiveInsightCampaign" ("unsubDomain");

-- 2. Create the UnsubDomainMapping table
--    domain       = the bare hostname extracted from the List-Unsubscribe URL
--                   (e.g. "nucleusemail.com", "send.winred.com")
--    friendlyName = admin-assigned provider name (null until assigned)
--    firstSeenAt  = when the cron first found this domain in the wild
CREATE TABLE IF NOT EXISTS "UnsubDomainMapping" (
  "id"           TEXT NOT NULL,
  "domain"       TEXT NOT NULL,
  "friendlyName" TEXT,
  "notes"        TEXT,
  "firstSeenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UnsubDomainMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UnsubDomainMapping_domain_key"
  ON "UnsubDomainMapping" ("domain");

CREATE INDEX IF NOT EXISTS "UnsubDomainMapping_friendlyName_idx"
  ON "UnsubDomainMapping" ("friendlyName");
