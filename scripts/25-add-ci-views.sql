-- Create CI Views table for saving filter configurations
CREATE TABLE IF NOT EXISTS "CiView" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "filterSettings" JSONB NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT "CiView_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE,
  CONSTRAINT "CiView_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Create index for faster lookups by client
CREATE INDEX IF NOT EXISTS "CiView_clientId_idx" ON "CiView"("clientId");

-- Create index for name searches
CREATE INDEX IF NOT EXISTS "CiView_name_idx" ON "CiView"("name");
