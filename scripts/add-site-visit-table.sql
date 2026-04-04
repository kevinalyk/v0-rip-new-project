-- Migration: Add SiteVisit table for tracking site visitors
-- Run this on Neon to create the visitor tracking table

CREATE TABLE IF NOT EXISTS "SiteVisit" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "referer" TEXT,
    "path" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "statusCode" INTEGER,
    "userId" TEXT,
    "userEmail" TEXT,
    "isAuthenticated" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT,
    "city" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteVisit_pkey" PRIMARY KEY ("id")
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS "SiteVisit_ip_idx" ON "SiteVisit"("ip");
CREATE INDEX IF NOT EXISTS "SiteVisit_userId_idx" ON "SiteVisit"("userId");
CREATE INDEX IF NOT EXISTS "SiteVisit_isAuthenticated_idx" ON "SiteVisit"("isAuthenticated");
CREATE INDEX IF NOT EXISTS "SiteVisit_createdAt_idx" ON "SiteVisit"("createdAt");
CREATE INDEX IF NOT EXISTS "SiteVisit_path_idx" ON "SiteVisit"("path");

-- Useful queries you can run:
-- 
-- Count authenticated vs anonymous visits today:
-- SELECT "isAuthenticated", COUNT(*) FROM "SiteVisit" WHERE "createdAt" > NOW() - INTERVAL '1 day' GROUP BY "isAuthenticated";
--
-- Top 10 IPs visiting without accounts:
-- SELECT "ip", COUNT(*) as visits FROM "SiteVisit" WHERE "isAuthenticated" = false GROUP BY "ip" ORDER BY visits DESC LIMIT 10;
--
-- Unique visitors per day:
-- SELECT DATE("createdAt") as date, COUNT(DISTINCT "ip") as unique_ips FROM "SiteVisit" GROUP BY DATE("createdAt") ORDER BY date DESC;
--
-- Users who visit most frequently:
-- SELECT "userEmail", COUNT(*) as visits FROM "SiteVisit" WHERE "isAuthenticated" = true GROUP BY "userEmail" ORDER BY visits DESC LIMIT 20;
