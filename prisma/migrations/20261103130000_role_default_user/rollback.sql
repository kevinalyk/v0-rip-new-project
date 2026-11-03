ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'viewer';
ALTER TABLE "BrandUser" ALTER COLUMN "role" SET DEFAULT 'viewer';

COMMENT ON COLUMN "User"."role" IS 'User role: "owner", "admin", "editor", "viewer", "super_admin"';
COMMENT ON COLUMN "BrandUser"."role" IS NULL;
