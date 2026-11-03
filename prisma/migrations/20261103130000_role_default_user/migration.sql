-- Change the default role for new rows from "viewer" to "user".
-- Metadata-only: existing rows are not rewritten. No row in either table currently stores "viewer".
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'user';
ALTER TABLE "BrandUser" ALTER COLUMN "role" SET DEFAULT 'user';

COMMENT ON COLUMN "User"."role" IS 'User role: "owner", "admin", "user", "lookup", "super_admin"';
COMMENT ON COLUMN "BrandUser"."role" IS 'Brand user role: "owner", "admin", "user", "super_admin"';
