-- Fix UnsubDomainMapping table columns to match Prisma schema
-- The original migration used firstSeenAt but Prisma expects createdAt/updatedAt

ALTER TABLE "UnsubDomainMapping"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Rename firstSeenAt → createdAt if createdAt doesn't exist yet
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'UnsubDomainMapping' AND column_name = 'firstSeenAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'UnsubDomainMapping' AND column_name = 'createdAt'
  ) THEN
    ALTER TABLE "UnsubDomainMapping" RENAME COLUMN "firstSeenAt" TO "createdAt";
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'UnsubDomainMapping' AND column_name = 'createdAt'
  ) THEN
    ALTER TABLE "UnsubDomainMapping"
      ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;
