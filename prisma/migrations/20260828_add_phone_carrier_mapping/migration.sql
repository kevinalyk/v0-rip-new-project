-- CreateTable
CREATE TABLE IF NOT EXISTS "PhoneCarrierMapping" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "carrierName" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneCarrierMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PhoneCarrierMapping_phoneNumber_key" ON "PhoneCarrierMapping"("phoneNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PhoneCarrierMapping_carrierName_idx" ON "PhoneCarrierMapping"("carrierName");
