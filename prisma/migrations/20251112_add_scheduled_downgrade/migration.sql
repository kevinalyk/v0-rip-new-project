-- Add scheduledDowngradePlan column to track future plan changes
ALTER TABLE "Client" ADD COLUMN "scheduledDowngradePlan" TEXT;
