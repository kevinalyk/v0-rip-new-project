-- Normalize inflated inbox/spam counts on CompetitiveInsightCampaign rows.
-- Rule 1: If spamCount > 0 (any spam seen), set spamCount = 1, inboxCount = 0.
--         Rationale: the reporting UI shows "Spam" badge whenever spamCount > 0,
--         regardless of inboxCount, so a single spam hit means it's spam.
-- Rule 2: If spamCount = 0 and inboxCount > 0, set inboxCount = 1.
--         Rationale: caps over-counted inbox results to a single confirmed inbox hit.

-- Rule 1: spam wins
UPDATE "CompetitiveInsightCampaign"
SET
  "spamCount" = 1,
  "inboxCount" = 0,
  "inboxRate"  = 0
WHERE "spamCount" > 0;

-- Rule 2: inbox only
UPDATE "CompetitiveInsightCampaign"
SET
  "inboxCount" = 1,
  "inboxRate"  = 100
WHERE "spamCount" = 0
  AND "inboxCount" > 0;
