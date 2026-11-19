CREATE TABLE IF NOT EXISTS "NewDomainRegistration" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "tld" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "matchedKeyword" TEXT,
    "state" TEXT,
    "linkedEntityId" TEXT,
    "registeredOn" TIMESTAMP(3) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewDomainRegistration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NewDomainRegistration_domain_key" ON "NewDomainRegistration"("domain");
CREATE INDEX IF NOT EXISTS "NewDomainRegistration_registeredOn_idx" ON "NewDomainRegistration"("registeredOn");
CREATE INDEX IF NOT EXISTS "NewDomainRegistration_category_idx" ON "NewDomainRegistration"("category");
CREATE INDEX IF NOT EXISTS "NewDomainRegistration_state_idx" ON "NewDomainRegistration"("state");
CREATE INDEX IF NOT EXISTS "NewDomainRegistration_linkedEntityId_idx" ON "NewDomainRegistration"("linkedEntityId");
