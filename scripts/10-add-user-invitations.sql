-- Updated all column names to camelCase to match database convention
CREATE TABLE IF NOT EXISTS "UserInvitation" (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expiresAt TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES "User"(id) ON DELETE CASCADE
);

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_user_invitations_token ON "UserInvitation"(token);
CREATE INDEX IF NOT EXISTS idx_user_invitations_user_id ON "UserInvitation"(userId);
CREATE INDEX IF NOT EXISTS idx_user_invitations_expires_at ON "UserInvitation"(expiresAt);
