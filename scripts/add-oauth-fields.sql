-- Add OAuth fields to SeedEmail table for Outlook integration
-- These fields will only be populated for Outlook/Hotmail accounts

ALTER TABLE "SeedEmail" ADD COLUMN IF NOT EXISTS "accessToken" TEXT;
ALTER TABLE "SeedEmail" ADD COLUMN IF NOT EXISTS "refreshToken" TEXT;
ALTER TABLE "SeedEmail" ADD COLUMN IF NOT EXISTS "tokenExpiry" TIMESTAMP;
ALTER TABLE "SeedEmail" ADD COLUMN IF NOT EXISTS "oauthConnected" BOOLEAN DEFAULT FALSE;

-- Add index for faster queries on OAuth connected accounts
CREATE INDEX IF NOT EXISTS "idx_seedemail_oauth_connected" ON "SeedEmail"("oauthConnected");
CREATE INDEX IF NOT EXISTS "idx_seedemail_provider_oauth" ON "SeedEmail"("provider", "oauthConnected");

-- Update existing Outlook accounts to have oauthConnected = false by default
UPDATE "SeedEmail" 
SET "oauthConnected" = FALSE 
WHERE ("provider" = 'outlook' OR "provider" = 'hotmail' OR "provider" = 'microsoft') 
AND "oauthConnected" IS NULL;

-- Add a comment to document the OAuth fields
COMMENT ON COLUMN "SeedEmail"."accessToken" IS 'Encrypted OAuth access token for Microsoft Graph API';
COMMENT ON COLUMN "SeedEmail"."refreshToken" IS 'Encrypted OAuth refresh token for Microsoft Graph API';
COMMENT ON COLUMN "SeedEmail"."tokenExpiry" IS 'When the current access token expires';
COMMENT ON COLUMN "SeedEmail"."oauthConnected" IS 'Whether this account has valid OAuth tokens';
