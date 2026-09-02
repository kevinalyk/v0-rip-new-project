-- AlterTable
ALTER TABLE "CompetitiveInsightCampaign" ADD COLUMN "isThirdParty" BOOLEAN;

-- AlterTable
ALTER TABLE "SmsQueue" ADD COLUMN "isThirdParty" BOOLEAN;

-- CreateIndex
CREATE INDEX "CompetitiveInsightCampaign_isThirdParty_idx" ON "CompetitiveInsightCampaign"("isThirdParty");

-- CreateIndex
CREATE INDEX "SmsQueue_isThirdParty_idx" ON "SmsQueue"("isThirdParty");
