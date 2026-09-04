-- Add trial fields to Client
ALTER TABLE "Client" ADD COLUMN "trialExpiresAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "trialEndedNoticeSeen" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Client_trialExpiresAt_idx" ON "Client"("trialExpiresAt");

-- TrialCode
CREATE TABLE "TrialCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "trialLengthDays" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "TrialCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrialCode_code_key" ON "TrialCode"("code");
CREATE INDEX "TrialCode_active_idx" ON "TrialCode"("active");

-- TrialCodeRedemption
CREATE TABLE "TrialCodeRedemption" (
    "id" TEXT NOT NULL,
    "trialCodeId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialCodeRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrialCodeRedemption_clientId_key" ON "TrialCodeRedemption"("clientId");
CREATE INDEX "TrialCodeRedemption_trialCodeId_idx" ON "TrialCodeRedemption"("trialCodeId");

ALTER TABLE "TrialCodeRedemption" ADD CONSTRAINT "TrialCodeRedemption_trialCodeId_fkey" FOREIGN KEY ("trialCodeId") REFERENCES "TrialCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrialCodeRedemption" ADD CONSTRAINT "TrialCodeRedemption_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
