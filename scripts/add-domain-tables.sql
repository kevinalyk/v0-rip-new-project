-- Add Domain table
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "description" TEXT,
    "dataRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- Add UserDomainAccess table
CREATE TABLE "UserDomainAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDomainAccess_pkey" PRIMARY KEY ("id")
);

-- Add DomainSetting table
CREATE TABLE "DomainSetting" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainSetting_pkey" PRIMARY KEY ("id")
);

-- Add domainId column to Campaign table
ALTER TABLE "Campaign" ADD COLUMN "domainId" TEXT;

-- Create unique constraints
CREATE UNIQUE INDEX "Domain_name_key" ON "Domain"("name");
CREATE UNIQUE INDEX "Domain_domain_key" ON "Domain"("domain");
CREATE UNIQUE INDEX "UserDomainAccess_userId_domainId_key" ON "UserDomainAccess"("userId", "domainId");
CREATE UNIQUE INDEX "DomainSetting_domainId_key_key" ON "DomainSetting"("domainId", "key");

-- Create indexes
CREATE INDEX "Campaign_domainId_idx" ON "Campaign"("domainId");
CREATE INDEX "Campaign_domainId_sentDate_idx" ON "Campaign"("domainId", "sentDate");

-- Add foreign key constraints
ALTER TABLE "UserDomainAccess" ADD CONSTRAINT "UserDomainAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserDomainAccess" ADD CONSTRAINT "UserDomainAccess_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DomainSetting" ADD CONSTRAINT "DomainSetting_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Note: We'll add the Campaign foreign key constraint after we populate domainId values
-- ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
