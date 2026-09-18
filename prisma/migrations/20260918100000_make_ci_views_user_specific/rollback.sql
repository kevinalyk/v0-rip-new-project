DROP TRIGGER IF EXISTS "UserCiView_sync_legacy_for_rollback" ON "UserCiView";
DROP FUNCTION IF EXISTS "syncLegacyCiViewForRollback"();
DROP TABLE IF EXISTS "UserCiView";
