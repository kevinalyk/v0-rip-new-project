-- ============================================================
-- Migration: Move LookupUser → User, re-point LookupSearch
-- Run this in Neon SQL Editor, then drop LookupUser manually.
-- ============================================================

BEGIN;

-- Step 1: Insert LookupUser records into User that don't already exist there.
-- Sets role = 'lookup', clientId = 'lookup', and blanks out required fields.
INSERT INTO "User" (
  id,
  email,
  password,
  "firstName",
  "lastName",
  role,
  "clientId",
  "firstLogin",
  "digestEnabled",
  "weeklyDigestEnabled",
  "createdAt",
  "updatedAt"
)
SELECT
  lu.id,
  lu.email,
  lu."passwordHash",
  '',
  '',
  'lookup',
  'lookup',
  false,
  false,
  false,
  lu."createdAt",
  lu."updatedAt"
FROM "LookupUser" lu
WHERE NOT EXISTS (
  SELECT 1 FROM "User" u WHERE lower(u.email) = lower(lu.email)
);

-- Step 2: For LookupUsers whose email already existed in User,
-- remap their LookupSearch rows to the existing User id.
UPDATE "LookupSearch" ls
SET "userId" = u.id
FROM "LookupUser" lu
JOIN "User" u ON lower(u.email) = lower(lu.email)
WHERE ls."userId" = lu.id
  AND u.id <> lu.id;

-- Step 3: Drop the foreign key from LookupSearch → LookupUser
-- and add a new one pointing to User.
ALTER TABLE "LookupSearch"
  DROP CONSTRAINT IF EXISTS "LookupSearch_userId_fkey";

ALTER TABLE "LookupSearch"
  ADD CONSTRAINT "LookupSearch_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;

-- Step 4: Verify — these should both return 0 rows before you drop LookupUser.
-- SELECT ls.id FROM "LookupSearch" ls
--   LEFT JOIN "User" u ON u.id = ls."userId"
--   WHERE u.id IS NULL;

COMMIT;

-- Step 5 (run separately after verifying above):
-- DROP TABLE "LookupUser";
