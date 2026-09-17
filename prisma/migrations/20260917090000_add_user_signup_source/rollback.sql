-- Manual rollback only. Removing this column discards signup attribution.
ALTER TABLE "User"
DROP COLUMN "signupSource";
