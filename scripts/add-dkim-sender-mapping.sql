-- Migration: Add dkimSelector to CompetitiveInsightCampaign and create DkimSenderMapping table
-- Step 1 of the Sender Provider feature

-- 1. Add dkimSelector column to store the raw parsed .s= value from DKIM-Signature header
--    (sendingProvider already exists and will store the resolved friendly name)
ALTER TABLE "CompetitiveInsightCampaign"
  ADD COLUMN IF NOT EXISTS "dkimSelector" TEXT;

CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_dkimSelector_idx"
  ON "CompetitiveInsightCampaign" ("dkimSelector");

-- 2. Create the DkimSenderMapping table for admin-managed selector → provider name mappings
CREATE TABLE IF NOT EXISTS "DkimSenderMapping" (
  "id"            TEXT NOT NULL,
  "selectorValue" TEXT NOT NULL,   -- e.g. "gears", "s1", "k1"
  "friendlyName"  TEXT NOT NULL,   -- e.g. "Message Gears", "Sendgrid"
  "notes"         TEXT,            -- optional internal notes
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DkimSenderMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DkimSenderMapping_selectorValue_key"
  ON "DkimSenderMapping" ("selectorValue");

-- 3. Seed a few known mappings to start with
INSERT INTO "DkimSenderMapping" ("id", "selectorValue", "friendlyName", "notes")
VALUES
  (gen_random_uuid()::text, 'gears',   'Message Gears',  'Used by some GOP orgs'),
  (gen_random_uuid()::text, 'k1',      'Klaviyo',        NULL),
  (gen_random_uuid()::text, 'cm',      'Campaign Monitor',NULL),
  (gen_random_uuid()::text, 'mandrill','Mandrill (Mailchimp)', NULL),
  (gen_random_uuid()::text, 'sendgrid','SendGrid',        NULL)
ON CONFLICT ("selectorValue") DO NOTHING;
