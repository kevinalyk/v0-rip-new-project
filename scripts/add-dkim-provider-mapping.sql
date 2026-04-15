-- Add sendingProvider to CompetitiveInsightCampaign
ALTER TABLE "CompetitiveInsightCampaign"
  ADD COLUMN IF NOT EXISTS "sendingProvider" TEXT;

CREATE INDEX IF NOT EXISTS "CompetitiveInsightCampaign_sendingProvider_idx"
  ON "CompetitiveInsightCampaign" ("sendingProvider");

-- DKIM selector -> provider name mapping table
CREATE TABLE IF NOT EXISTS "DkimProviderMapping" (
  "id"           TEXT NOT NULL,
  "selector"     TEXT NOT NULL,
  "providerName" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DkimProviderMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DkimProviderMapping_selector_key"
  ON "DkimProviderMapping" ("selector");

-- Seed known mappings
INSERT INTO "DkimProviderMapping" ("id", "selector", "providerName")
VALUES
  ('dkim_gears',      'gears',        'Message Gears'),
  ('dkim_s1',         's1',           'Sendgrid'),
  ('dkim_s2',         's2',           'Sendgrid'),
  ('dkim_k1',         'k1',           'Mailchimp'),
  ('dkim_k2',         'k2',           'Mailchimp'),
  ('dkim_mx',         'mx',           'Mailgun'),
  ('dkim_mailo',      'mailo',        'Mailgun'),
  ('dkim_em',         'em',           'Sailthru'),
  ('dkim_everest',    'everest',      'Everest'),
  ('dkim_dkim',       'dkim',         'Generic DKIM'),
  ('dkim_google',     'google',       'Google'),
  ('dkim_20210112',   '20210112',     'Google Workspace'),
  ('dkim_20161025',   '20161025',     'Google Workspace'),
  ('dkim_braze',      'braze',        'Braze'),
  ('dkim_sfmc',       'sfmc',         'Salesforce Marketing Cloud'),
  ('dkim_pp',         'pp',           'Postmark'),
  ('dkim_mte',        'mte',          'Movable Ink'),
  ('dkim_yesmail',    'yesmail',      'Yesmail'),
  ('dkim_mkto',       'mkto',         'Marketo'),
  ('dkim_klaviyo',    'klaviyo',      'Klaviyo'),
  ('dkim_sm',         'sm',           'SparkPost'),
  ('dkim_scph',       'scph',         'Constant Contact'),
  ('dkim_mxout',      'mxout',        'MX Out'),
  ('dkim_arc',        'arc',          'ARC-20240605'),
  ('dkim_iterable',   'iterable',     'Iterable'),
  ('dkim_exacttarget','exacttarget',  'Salesforce ExactTarget')
ON CONFLICT ("selector") DO NOTHING;
