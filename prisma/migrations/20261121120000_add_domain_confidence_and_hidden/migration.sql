ALTER TABLE "NewDomainRegistration" ADD COLUMN IF NOT EXISTS "confidence" TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "NewDomainRegistration" ADD COLUMN IF NOT EXISTS "hidden" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "NewDomainRegistration_hidden_confidence_idx" ON "NewDomainRegistration"("hidden", "confidence");
