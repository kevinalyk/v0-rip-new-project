-- Create Clients table for multi-tenant architecture
-- This replaces the Domain-based multi-tenancy with Client-based multi-tenancy

CREATE TABLE IF NOT EXISTS "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "dataRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on client name
CREATE UNIQUE INDEX IF NOT EXISTS "Client_name_key" ON "Client"("name");

-- Insert RIP as the master client (for admin seed pool)
INSERT INTO "Client" ("id", "name", "description", "active", "dataRetentionDays", "createdAt", "updatedAt")
VALUES (
    'client_rip_master',
    'RIP',
    'Master client for RIP admin team - owns the master seed pool',
    true,
    90,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT ("name") DO NOTHING;

-- Add clientId column to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "clientId" TEXT;

-- Create index for User.clientId
CREATE INDEX IF NOT EXISTS "User_clientId_idx" ON "User"("clientId");

-- Add ownership and assignment columns to SeedEmail table
ALTER TABLE "SeedEmail" ADD COLUMN IF NOT EXISTS "ownedByClient" TEXT;
ALTER TABLE "SeedEmail" ADD COLUMN IF NOT EXISTS "assignedToClient" TEXT;

-- Create indexes for seed email client filtering
CREATE INDEX IF NOT EXISTS "SeedEmail_ownedByClient_idx" ON "SeedEmail"("ownedByClient");
CREATE INDEX IF NOT EXISTS "SeedEmail_assignedToClient_idx" ON "SeedEmail"("assignedToClient");
CREATE INDEX IF NOT EXISTS "SeedEmail_ownedByClient_assignedToClient_idx" ON "SeedEmail"("ownedByClient", "assignedToClient");

-- Check what we created
SELECT 'Client table and seed email ownership columns created' as status;
SELECT * FROM "Client" WHERE name = 'RIP';
