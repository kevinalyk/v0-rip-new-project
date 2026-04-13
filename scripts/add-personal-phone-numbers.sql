-- Add PersonalPhoneNumber table for assigning phone numbers to clients
-- This enables SMS to be attributed to specific clients (personal SMS)

CREATE TABLE IF NOT EXISTS "PersonalPhoneNumber" (
  "id" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "assignedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PersonalPhoneNumber_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on phone number (each number can only be assigned to one client)
CREATE UNIQUE INDEX IF NOT EXISTS "PersonalPhoneNumber_phoneNumber_key" ON "PersonalPhoneNumber"("phoneNumber");

-- Index for looking up by client
CREATE INDEX IF NOT EXISTS "PersonalPhoneNumber_clientId_idx" ON "PersonalPhoneNumber"("clientId");

-- Foreign key to Client table
ALTER TABLE "PersonalPhoneNumber" 
ADD CONSTRAINT "PersonalPhoneNumber_clientId_fkey" 
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
