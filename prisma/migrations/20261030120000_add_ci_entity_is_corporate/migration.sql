ALTER TABLE "CiEntity" ADD COLUMN "isCorporate" BOOLEAN NOT NULL DEFAULT false;

UPDATE "CiEntity" SET "isCorporate" = true WHERE "type" IN ('media', 'retail');

CREATE INDEX "CiEntity_isCorporate_idx" ON "CiEntity"("isCorporate");
