-- Migration: Add ApiKey table for public API authentication
-- Date: 2026-04-03

-- Create the ApiKey table
CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "clientId" TEXT,
    "scopes" JSONB NOT NULL DEFAULT '["campaigns:read", "sms:read", "entities:read"]',
    "rateLimit" INTEGER NOT NULL DEFAULT 100,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on keyHash
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");
CREATE INDEX IF NOT EXISTS "ApiKey_keyPrefix_idx" ON "ApiKey"("keyPrefix");
CREATE INDEX IF NOT EXISTS "ApiKey_clientId_idx" ON "ApiKey"("clientId");
CREATE INDEX IF NOT EXISTS "ApiKey_isActive_idx" ON "ApiKey"("isActive");
CREATE INDEX IF NOT EXISTS "ApiKey_expiresAt_idx" ON "ApiKey"("expiresAt");
