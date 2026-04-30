-- Migration: Create campaign_launches table
-- Tracks newly launched political campaigns scraped from external sources (Ballotpedia, FEC, etc.)
-- Separate from CiEntity — this is an event log of campaign announcements.
-- When a launch is scraped, a stub CiEntity is auto-created and linked via linkedEntityId.
-- Run this against your Neon database before deploying the campaign launches feature.

CREATE TABLE IF NOT EXISTS "CampaignLaunch" (
  -- Identity
  "id"                 TEXT NOT NULL PRIMARY KEY,

  -- Core candidate info (name is the only required field)
  "name"               TEXT NOT NULL,
  "party"              TEXT,                   -- 'republican' | 'democrat' | 'independent' | etc.
  "state"              TEXT,                   -- two-letter state code, e.g. 'MT'
  "office"             TEXT,                   -- e.g. 'U.S. House' | 'Governor' | 'State Senate'
  "district"           TEXT,                   -- e.g. 'CA-45' | 'District 6'

  -- Timing
  "launchedAt"         TIMESTAMP(3),           -- when the candidate actually announced (if known)
  "firstSeenAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUpdatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Source tracking (used for dedup + audit trail)
  "source"             TEXT NOT NULL,          -- 'ballotpedia' | 'fec' | 'politics1' | 'manual'
  "sourceUrl"          TEXT,                   -- link to the source page we scraped
  "sourceExternalId"   TEXT,                   -- unique ID on the source side (for dedup)

  -- Lifecycle
  "status"             TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'withdrawn' | 'won' | 'lost'

  -- Link to CiEntity (populated automatically on scrape when stub entity is created)
  "linkedEntityId"     TEXT,

  -- Standard timestamps
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Foreign key to CiEntity
  CONSTRAINT "CampaignLaunch_linkedEntityId_fkey"
    FOREIGN KEY ("linkedEntityId")
    REFERENCES "CiEntity"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

-- Dedup constraint: a given source + external ID should only appear once
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignLaunch_source_sourceExternalId_key"
  ON "CampaignLaunch"("source", "sourceExternalId")
  WHERE "sourceExternalId" IS NOT NULL;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS "CampaignLaunch_launchedAt_idx"     ON "CampaignLaunch"("launchedAt" DESC);
CREATE INDEX IF NOT EXISTS "CampaignLaunch_firstSeenAt_idx"    ON "CampaignLaunch"("firstSeenAt" DESC);
CREATE INDEX IF NOT EXISTS "CampaignLaunch_source_idx"         ON "CampaignLaunch"("source");
CREATE INDEX IF NOT EXISTS "CampaignLaunch_state_idx"          ON "CampaignLaunch"("state");
CREATE INDEX IF NOT EXISTS "CampaignLaunch_party_idx"          ON "CampaignLaunch"("party");
CREATE INDEX IF NOT EXISTS "CampaignLaunch_status_idx"         ON "CampaignLaunch"("status");
CREATE INDEX IF NOT EXISTS "CampaignLaunch_linkedEntityId_idx" ON "CampaignLaunch"("linkedEntityId");
