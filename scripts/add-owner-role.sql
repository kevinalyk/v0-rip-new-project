-- Migration script to add "owner" role support
-- This script updates the User table to allow "owner" as a valid role

-- Update the comment on the role column to include "owner"
COMMENT ON COLUMN "User".role IS 'User role: "owner", "admin", "editor", "viewer", "super_admin"';

-- Note: No schema changes needed as role is already a String field
-- Existing users will need to be manually updated to "owner" role as needed
-- Example update query (run manually for specific users):
-- UPDATE "User" SET role = 'owner' WHERE email = 'user@example.com';
