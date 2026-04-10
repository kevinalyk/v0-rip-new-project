-- Migration: Add Ballotpedia enrichment fields to CiEntity
-- Run this against your Neon database before deploying the scraper feature.

ALTER TABLE "CiEntity"
  ADD COLUMN IF NOT EXISTS "imageUrl"       TEXT,
  ADD COLUMN IF NOT EXISTS "bio"            TEXT,
  ADD COLUMN IF NOT EXISTS "ballotpediaUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "ballotpediaFetchedAt" TIMESTAMP(3);
