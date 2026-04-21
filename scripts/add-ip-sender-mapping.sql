-- Migration: Add IP-based sender identification
-- Run this in Neon SQL Editor
-- Date: 2026-04-20

-- 1. Add sendingIp column to CompetitiveInsightCampaign
--    Stores the parsed sending IP from rawHeaders so the cron doesn't re-parse headers every run.
ALTER TABLE "CompetitiveInsightCampaign"
  ADD COLUMN IF NOT EXISTS "sendingIp" TEXT;

CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_sendingIp_idx"
  ON "CompetitiveInsightCampaign" ("sendingIp");

-- sendingProvider already exists and will now be populated from IP lookups instead of DKIM.
-- No change needed to that column.

-- 2. Create IpSenderMapping table
--    One row per unique IP address.
--    orgName    = raw org name from ARIN RDAP (e.g. "MessageGears, LLC") — auto-populated
--    friendlyName = human-readable override (e.g. "MessageGears") — manually set by admin
--    cidr       = CIDR block the IP belongs to (e.g. "63.143.59.128/25") — from RDAP
--    reverseDns = PTR record (e.g. "mail.messagegears.net") — fallback for generic cloud IPs
--    rdapChecked = whether we have attempted an RDAP lookup for this IP
--    lastLookedUpAt = when the RDAP lookup last ran (for re-check scheduling)
CREATE TABLE IF NOT EXISTS "IpSenderMapping" (
  "id"             TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "ip"             TEXT        NOT NULL,
  "cidr"           TEXT,
  "orgName"        TEXT,
  "friendlyName"   TEXT,
  "reverseDns"     TEXT,
  "rdapChecked"    BOOLEAN     NOT NULL DEFAULT FALSE,
  "lastLookedUpAt" TIMESTAMP(3),
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IpSenderMapping_pkey" PRIMARY KEY ("id")
);

-- Unique constraint so we never double-insert the same IP
CREATE UNIQUE INDEX IF NOT EXISTS "IpSenderMapping_ip_key"
  ON "IpSenderMapping" ("ip");

-- Index for quick lookups by org/friendly name (used in admin UI filtering)
CREATE INDEX IF NOT EXISTS "IpSenderMapping_orgName_idx"
  ON "IpSenderMapping" ("orgName");

CREATE INDEX IF NOT EXISTS "IpSenderMapping_friendlyName_idx"
  ON "IpSenderMapping" ("friendlyName");

CREATE INDEX IF NOT EXISTS "IpSenderMapping_rdapChecked_idx"
  ON "IpSenderMapping" ("rdapChecked");
