-- Drop the existing UserInvitation table with lowercase columns
DROP TABLE IF EXISTS "UserInvitation";

-- Recreate UserInvitation table with camelCase columns to match User table convention
CREATE TABLE "UserInvitation" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  userId TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expiresAt TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_active_invitation UNIQUE (userId, used)
);

-- Create index for faster token lookups
CREATE INDEX idx_user_invitation_token ON "UserInvitation"(token);
CREATE INDEX idx_user_invitation_user_id ON "UserInvitation"(userId);
