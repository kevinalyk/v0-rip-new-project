-- Create RedactedName table for storing names/terms to redact from email and SMS content
-- These names are redacted with [Omitted] to protect seed identities

CREATE TABLE IF NOT EXISTS "RedactedName" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "addedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RedactedName_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on name to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS "RedactedName_name_key" ON "RedactedName"("name");

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS "RedactedName_name_idx" ON "RedactedName"("name");
