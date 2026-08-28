-- Add self-reported "Google Verified" toggle to ClientDomain, unique per domain
-- (needed for the Google bulk sender verification requirement launching Sept 8)

ALTER TABLE "ClientDomain"
ADD COLUMN IF NOT EXISTS "googleVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "googleVerifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "googleVerifiedByUserId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ClientDomain_googleVerifiedByUserId_fkey'
  ) THEN
    ALTER TABLE "ClientDomain"
    ADD CONSTRAINT "ClientDomain_googleVerifiedByUserId_fkey"
    FOREIGN KEY ("googleVerifiedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
