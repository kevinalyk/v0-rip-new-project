-- Add slug column to Client table
ALTER TABLE "Client" 
ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- Add unique constraint on slug
CREATE UNIQUE INDEX IF NOT EXISTS "Client_slug_key" ON "Client"("slug");

-- Add comment explaining slug generation
COMMENT ON COLUMN "Client"."slug" IS 'URL-safe slug generated from client name (lowercase, no spaces). Example: "Red Spark Strategy" -> "redsparkstrategy"';

-- Display current clients for manual slug assignment
SELECT 
    id,
    name,
    slug,
    LOWER(REPLACE(name, ' ', '')) as suggested_slug
FROM "Client"
ORDER BY name;
