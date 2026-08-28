-- Reuses the existing "ApiKey" table (see 20260101_add_api_keys or equivalent).
-- Adds an audit log for the Claude CI Assignment MCP + a global kill switch.

CREATE TABLE IF NOT EXISTS "CiApiActionLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "apiKeyId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reasoning" TEXT,
  "targetType" TEXT,
  "targetIds" JSONB,
  "entityId" TEXT,
  "beforeState" JSONB,
  "afterState" JSONB,
  "undone" BOOLEAN NOT NULL DEFAULT false,
  "undoneAt" TIMESTAMP(3),
  "undoneBy" TEXT,
  "requestIp" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CiApiActionLog_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CiApiActionLog_apiKeyId_idx" ON "CiApiActionLog"("apiKeyId");
CREATE INDEX IF NOT EXISTS "CiApiActionLog_action_idx" ON "CiApiActionLog"("action");
CREATE INDEX IF NOT EXISTS "CiApiActionLog_entityId_idx" ON "CiApiActionLog"("entityId");
CREATE INDEX IF NOT EXISTS "CiApiActionLog_createdAt_idx" ON "CiApiActionLog"("createdAt");
CREATE INDEX IF NOT EXISTS "CiApiActionLog_undone_idx" ON "CiApiActionLog"("undone");

CREATE TABLE IF NOT EXISTS "AutomationSetting" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ciAssignmentEnabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT
);
