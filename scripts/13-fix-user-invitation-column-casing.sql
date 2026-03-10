-- Fix UserInvitation table: ensure columns use quoted camelCase to match app code
-- The previous migration created columns without quotes, so PostgreSQL stored them as lowercase

-- Drop and recreate with properly quoted column names
DROP TABLE IF EXISTS "UserInvitation";

CREATE TABLE "UserInvitation" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_invitation_token ON "UserInvitation"(token);
CREATE INDEX idx_user_invitation_user_id ON "UserInvitation"("userId");
