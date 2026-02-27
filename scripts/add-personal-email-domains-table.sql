-- Migration: Add PersonalEmailDomain table
-- This table maps inbound email domains to clients for the personal email feature.
-- When useSlug = true, the local part of the email address is matched to a client slug
-- (e.g. rip@realdailyreview.com → slug "rip" → look up client by slug).
-- When useSlug = false, the entire domain maps to the single clientId stored on the row.

CREATE TABLE IF NOT EXISTS "PersonalEmailDomain" (
  "id"        TEXT NOT NULL,
  "domain"    TEXT NOT NULL,
  "clientId"  TEXT NOT NULL,
  "useSlug"   BOOLEAN NOT NULL DEFAULT true,
  "addedBy"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PersonalEmailDomain_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PersonalEmailDomain_domain_key" UNIQUE ("domain"),
  CONSTRAINT "PersonalEmailDomain_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PersonalEmailDomain_domain_idx"   ON "PersonalEmailDomain"("domain");
CREATE INDEX IF NOT EXISTS "PersonalEmailDomain_clientId_idx" ON "PersonalEmailDomain"("clientId");

-- Seed: add realdailyreview.com mapped to the RIP client (useSlug = true)
-- This covers all current clients who use {slug}@realdailyreview.com
INSERT INTO "PersonalEmailDomain" ("id", "domain", "clientId", "useSlug", "addedBy", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'realdailyreview.com',
  c."id",
  true,
  'system',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Client" c
WHERE c."slug" = 'rip'
ON CONFLICT ("domain") DO NOTHING;
