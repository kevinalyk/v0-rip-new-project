-- Add EmailClickEvent table for tracking email digest link clicks
CREATE TABLE IF NOT EXISTS "EmailClickEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "emailType" TEXT NOT NULL,
  "linkType" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "referrer" TEXT,
  "userAgent" TEXT,
  "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX "EmailClickEvent_userId_idx" ON "EmailClickEvent"("userId");
CREATE INDEX "EmailClickEvent_emailType_idx" ON "EmailClickEvent"("emailType");
CREATE INDEX "EmailClickEvent_linkType_idx" ON "EmailClickEvent"("linkType");
CREATE INDEX "EmailClickEvent_clickedAt_idx" ON "EmailClickEvent"("clickedAt");
