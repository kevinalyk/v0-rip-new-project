-- Merge duplicate CompetitiveInsightCampaign rows.
-- "Duplicates" are rows with the same senderEmail + same calendar day + same normalized subject.
-- Normalization: lowercased, re:/fwd: prefixes removed, leading capitalized word before punctuation replaced with __name__.
-- The [Omitted] version is always kept as canonical. Dupes are soft-deleted (isDeleted = true).
-- Counts (inbox, spam, notDelivered) from dupes are summed into the canonical row.
-- Safe to run multiple times (idempotent).

BEGIN;

-- Step 1: Build a temp table of all non-deleted campaigns with a normalized subject key
CREATE TEMP TABLE _camp_normalized AS
SELECT
  id,
  "senderEmail",
  DATE("dateReceived") AS recv_day,
  subject,
  "inboxCount",
  "spamCount",
  "notDeliveredCount",
  -- Normalize: lowercase, strip re:/fwd:, replace [Omitted] and capitalized first-words before punctuation
  lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(subject, '^(re|fwd|fw|forward):\s*', '', 'i'),
          '\[Omitted\]', '__name__', 'gi'
        ),
        '\b[A-Z][a-z]{1,20}(?=\s*[,!?:])', '__name__', 'g'
      ),
      '\s+', ' ', 'g'
    )
  ) AS norm_subject
FROM "CompetitiveInsightCampaign"
WHERE "isDeleted" = false;

-- Step 2: Find groups with 2+ rows sharing senderEmail + recv_day + norm_subject
CREATE TEMP TABLE _dupe_groups AS
SELECT "senderEmail", recv_day, norm_subject
FROM _camp_normalized
GROUP BY "senderEmail", recv_day, norm_subject
HAVING COUNT(*) > 1;

-- Step 3: For each dupe group, pick the canonical row:
--   prefer the one whose subject contains '[Omitted]', else pick the one with the most recent id
CREATE TEMP TABLE _canonical AS
SELECT DISTINCT ON (g."senderEmail", g.recv_day, g.norm_subject)
  c.id AS canonical_id,
  g."senderEmail",
  g.recv_day,
  g.norm_subject
FROM _dupe_groups g
JOIN _camp_normalized c
  ON c."senderEmail" = g."senderEmail"
  AND c.recv_day = g.recv_day
  AND c.norm_subject = g.norm_subject
ORDER BY
  g."senderEmail",
  g.recv_day,
  g.norm_subject,
  -- prefer [Omitted] subjects first, then newest id
  (c.subject LIKE '%[Omitted]%') DESC,
  c.id DESC;

-- Step 4: Sum counts from ALL rows in the group into the canonical row
UPDATE "CompetitiveInsightCampaign" AS target
SET
  "inboxCount" = agg.total_inbox,
  "spamCount" = agg.total_spam,
  "notDeliveredCount" = agg.total_not_delivered,
  "updatedAt" = NOW()
FROM (
  SELECT
    can.canonical_id,
    SUM(c."inboxCount") AS total_inbox,
    SUM(c."spamCount") AS total_spam,
    SUM(c."notDeliveredCount") AS total_not_delivered
  FROM _canonical can
  JOIN _camp_normalized c
    ON c."senderEmail" = can."senderEmail"
    AND c.recv_day = can.recv_day
    AND c.norm_subject = can.norm_subject
  GROUP BY can.canonical_id
) agg
WHERE target.id = agg.canonical_id;

-- Step 5: Soft-delete all non-canonical dupes
UPDATE "CompetitiveInsightCampaign"
SET "isDeleted" = true, "updatedAt" = NOW()
WHERE id IN (
  SELECT c.id
  FROM _camp_normalized c
  JOIN _canonical can
    ON c."senderEmail" = can."senderEmail"
    AND c.recv_day = can.recv_day
    AND c.norm_subject = can.norm_subject
  WHERE c.id != can.canonical_id
);

-- Preview what was affected before committing
SELECT
  (SELECT COUNT(*) FROM _dupe_groups) AS dupe_groups_found,
  (SELECT COUNT(*) FROM _canonical) AS canonical_rows_kept,
  (SELECT COUNT(*) FROM "CompetitiveInsightCampaign" WHERE "isDeleted" = true AND "updatedAt" > NOW() - INTERVAL '1 minute') AS rows_soft_deleted;

COMMIT;
