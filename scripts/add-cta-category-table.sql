-- Migration: Add CTA category caching table
-- This table caches AI categorizations of CTA URLs to reduce API costs

CREATE TABLE IF NOT EXISTS "CtaCategory" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CtaCategory_pkey" PRIMARY KEY ("id")
);

-- Create unique index on URL for fast lookups
CREATE UNIQUE INDEX "CtaCategory_url_key" ON "CtaCategory"("url");

-- Create indexes for common queries
CREATE INDEX "CtaCategory_url_idx" ON "CtaCategory"("url");
CREATE INDEX "CtaCategory_category_idx" ON "CtaCategory"("category");
