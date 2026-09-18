-- The legacy client-scoped table is intentionally retained by the forward
-- migration, so rollback is lossless for the pre-release application.
DROP TABLE IF EXISTS "CiUserEntitySubscription";
