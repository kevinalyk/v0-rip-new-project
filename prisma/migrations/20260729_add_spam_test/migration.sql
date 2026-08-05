-- CreateTable: SpamTest
CREATE TABLE IF NOT EXISTS "SpamTest" (
  "id"            TEXT NOT NULL,
  "clientId"      TEXT NOT NULL,
  "clientSlug"    TEXT NOT NULL,
  "testAddress"   TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'pending',
  "expiresAt"     TIMESTAMP(3) NOT NULL,
  "receivedAt"    TIMESTAMP(3),
  "subject"       TEXT,
  "fromAddress"   TEXT,
  "score"         DOUBLE PRECISION,
  "maxScore"      DOUBLE PRECISION,
  "spamRules"     JSONB,
  "spfResult"     TEXT,
  "dkimResult"    TEXT,
  "dmarcResult"   TEXT,
  "htmlAnalysis"  JSONB,
  "rawHeaders"    JSONB,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SpamTest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SpamTest_testAddress_key" UNIQUE ("testAddress"),
  CONSTRAINT "SpamTest_clientId_fkey" FOREIGN KEY ("clientId")
    REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SpamTest_clientId_idx"   ON "SpamTest"("clientId");
CREATE INDEX IF NOT EXISTS "SpamTest_clientSlug_idx" ON "SpamTest"("clientSlug");
CREATE INDEX IF NOT EXISTS "SpamTest_status_idx"     ON "SpamTest"("status");
CREATE INDEX IF NOT EXISTS "SpamTest_createdAt_idx"  ON "SpamTest"("createdAt");
