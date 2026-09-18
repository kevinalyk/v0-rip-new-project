-- Reconcile any legacy-table changes made during the deployment window.
DELETE FROM "CiUserEntitySubscription" AS personal
WHERE NOT EXISTS (
  SELECT 1
  FROM "CiEntitySubscription" AS legacy
  WHERE legacy."clientId" = personal."clientId"
    AND legacy."entityId" = personal."entityId"
);

INSERT INTO "CiUserEntitySubscription" ("id", "clientId", "userId", "entityId", "createdAt", "updatedAt")
SELECT
  'user_follow_' || md5(legacy."id" || ':' || app_user."id"),
  legacy."clientId",
  app_user."id",
  legacy."entityId",
  legacy."createdAt",
  legacy."updatedAt"
FROM "CiEntitySubscription" AS legacy
JOIN "User" AS app_user ON app_user."clientId" = legacy."clientId"
ON CONFLICT ("userId", "entityId") DO NOTHING;

-- During normal operation the legacy table represents the client-wide union of
-- personal follows. This keeps the previous application version usable as an
-- immediate rollback target without changing personal-follow behavior.
CREATE OR REPLACE FUNCTION "syncLegacyCiEntitySubscriptionUnion"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "CiEntitySubscription" ("id", "clientId", "entityId", "createdAt", "updatedAt")
    VALUES (
      'legacy_union_' || md5(NEW."clientId" || ':' || NEW."entityId"),
      NEW."clientId",
      NEW."entityId",
      NEW."createdAt",
      NEW."updatedAt"
    )
    ON CONFLICT ("clientId", "entityId") DO NOTHING;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "CiUserEntitySubscription"
    WHERE "clientId" = OLD."clientId" AND "entityId" = OLD."entityId"
  ) THEN
    DELETE FROM "CiEntitySubscription"
    WHERE "clientId" = OLD."clientId" AND "entityId" = OLD."entityId";
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CiUserEntitySubscription_sync_legacy_union"
AFTER INSERT OR DELETE ON "CiUserEntitySubscription"
FOR EACH ROW EXECUTE FUNCTION "syncLegacyCiEntitySubscriptionUnion"();
