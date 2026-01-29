-- Create BlockedDomain table for filtering out unwanted system emails
CREATE TABLE IF NOT EXISTS "BlockedDomain" (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  reason TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL
);

-- Add index for faster domain lookups
CREATE INDEX IF NOT EXISTS "BlockedDomain_domain_idx" ON "BlockedDomain"(domain);
