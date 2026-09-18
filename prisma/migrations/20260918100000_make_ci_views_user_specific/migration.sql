-- Create a parallel personal-view table so the currently deployed application
-- can continue using the legacy client-wide "CiView" table until cutover.
CREATE TABLE "UserCiView" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "filterSettings" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserCiView_pkey" PRIMARY KEY ("id")
);

-- Every current teammate starts with a personal copy of every view that was
-- previously shared across their client. Their copies diverge after deployment.
INSERT INTO "UserCiView" (
    "id", "name", "clientId", "filterSettings", "createdBy", "createdAt", "updatedAt"
)
SELECT
    'user_view_' || md5(legacy."id" || ':' || app_user."id"),
    legacy."name",
    legacy."clientId",
    legacy."filterSettings",
    app_user."id",
    legacy."createdAt",
    legacy."updatedAt"
FROM "CiView" AS legacy
JOIN "User" AS app_user ON app_user."clientId" = legacy."clientId";

CREATE INDEX "UserCiView_clientId_idx" ON "UserCiView"("clientId");
CREATE INDEX "UserCiView_createdBy_idx" ON "UserCiView"("createdBy");
CREATE INDEX "UserCiView_name_idx" ON "UserCiView"("name");

ALTER TABLE "UserCiView"
    ADD CONSTRAINT "UserCiView_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCiView"
    ADD CONSTRAINT "UserCiView_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve views created after cutover in the legacy table as a rollback-only
-- client-wide representation. Personal ownership remains authoritative in UserCiView.
CREATE OR REPLACE FUNCTION "syncLegacyCiViewForRollback"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "CiView" (
      "id", "name", "clientId", "filterSettings", "createdBy", "createdAt", "updatedAt"
    ) VALUES (
      NEW."id", NEW."name", NEW."clientId", NEW."filterSettings", NEW."createdBy", NEW."createdAt", NEW."updatedAt"
    ) ON CONFLICT ("id") DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE "CiView"
    SET "name" = NEW."name",
        "filterSettings" = NEW."filterSettings",
        "updatedAt" = NEW."updatedAt"
    WHERE "id" = NEW."id";
    RETURN NEW;
  END IF;

  DELETE FROM "CiView" WHERE "id" = OLD."id";
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UserCiView_sync_legacy_for_rollback"
AFTER INSERT OR UPDATE OR DELETE ON "UserCiView"
FOR EACH ROW EXECUTE FUNCTION "syncLegacyCiViewForRollback"();
