-- Add entityId to SmsQueue table to link SMS messages to CI entities
ALTER TABLE "SmsQueue" ADD COLUMN "entityId" TEXT;

-- Add foreign key constraint
ALTER TABLE "SmsQueue" ADD CONSTRAINT "SmsQueue_entityId_fkey" 
  FOREIGN KEY ("entityId") REFERENCES "CiEntity"("id") ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX "SmsQueue_entityId_idx" ON "SmsQueue"("entityId");

-- Update CiEntityMapping to support phone number mappings
ALTER TABLE "CiEntityMapping" ADD COLUMN "senderPhone" TEXT;

-- Add index for phone number lookups
CREATE INDEX "CiEntityMapping_senderPhone_idx" ON "CiEntityMapping"("senderPhone");
