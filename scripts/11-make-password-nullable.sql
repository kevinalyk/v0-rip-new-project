-- Make password column nullable to support user invitations
-- Users will have NULL password until they set it via invitation link

ALTER TABLE "User" 
ALTER COLUMN password DROP NOT NULL;

-- Add a comment to document this change
COMMENT ON COLUMN "User".password IS 'Password hash - NULL for invited users who have not yet set their password';
