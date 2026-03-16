-- Add SupportTicket table for user-submitted problem reports

CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "clientId"      TEXT,
  "userId"        TEXT,
  "userEmail"     TEXT NOT NULL,
  "category"      TEXT NOT NULL,
  "pageUrl"       TEXT,
  "description"   TEXT NOT NULL,
  "screenshotUrl" TEXT,
  "status"        TEXT NOT NULL DEFAULT 'open',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "SupportTicket_clientId_idx" ON "SupportTicket"("clientId");
CREATE INDEX IF NOT EXISTS "SupportTicket_userId_idx"   ON "SupportTicket"("userId");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_idx"   ON "SupportTicket"("status");
CREATE INDEX IF NOT EXISTS "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt" DESC);
