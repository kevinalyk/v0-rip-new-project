-- Create entity_tags table for custom entity tagging per client
-- Allows clients to create up to 5 custom tags to organize and filter entities

-- Updated to use correct table name "CiEntity" instead of entities
CREATE TABLE IF NOT EXISTS "EntityTag" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "tagName" VARCHAR(50) NOT NULL,
  "tagColor" VARCHAR(7) NOT NULL, -- Hex color code like #FF5733
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure no duplicate tags per entity
  CONSTRAINT "EntityTag_client_entity_tag_unique" UNIQUE ("clientId", "entityId", "tagName"),
  
  -- Foreign keys
  CONSTRAINT "EntityTag_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CiEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EntityTag_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS "EntityTag_clientId_idx" ON "EntityTag"("clientId");
CREATE INDEX IF NOT EXISTS "EntityTag_entityId_idx" ON "EntityTag"("entityId");
CREATE INDEX IF NOT EXISTS "EntityTag_clientId_tagName_idx" ON "EntityTag"("clientId", "tagName");
