-- Manual rollback only. Removing this column discards signup attribution.
ALTER TABLE "MobilePushToken"
ALTER COLUMN "followingEnabled" SET DEFAULT false;

ALTER TABLE "User"
DROP COLUMN "signupSource";
