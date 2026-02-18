-- Cleanup duplicate SMS messages in SmsQueue
-- Duplicates are identified by matching phoneNumber, toNumber, and message
-- Keeps the oldest record (earliest createdAt) and deletes newer ones

-- First, let's see how many duplicates we have (optional preview query)
-- SELECT 
--   "phoneNumber", 
--   "toNumber", 
--   message, 
--   COUNT(*) as duplicate_count
-- FROM "SmsQueue"
-- GROUP BY "phoneNumber", "toNumber", message
-- HAVING COUNT(*) > 1
-- ORDER BY duplicate_count DESC;

-- Fixed column name quoting to match PostgreSQL case sensitivity
-- Delete duplicate SMS records, keeping only the oldest one for each unique combination
DELETE FROM "SmsQueue"
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY "phoneNumber", "toNumber", message 
        ORDER BY "createdAt" ASC
      ) AS rn
    FROM "SmsQueue"
  ) AS ranked
  WHERE rn > 1
);

-- Show summary of what was deleted
-- This will show 0 rows after cleanup, but you can run it before to see what will be deleted
SELECT 
  "phoneNumber", 
  "toNumber", 
  LEFT(message, 50) as message_preview,
  COUNT(*) as duplicate_count
FROM "SmsQueue"
GROUP BY "phoneNumber", "toNumber", message
HAVING COUNT(*) > 1;
