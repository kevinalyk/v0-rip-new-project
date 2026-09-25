-- CreateTable
CREATE TABLE "WinRedInboxMessage" (
    "id" TEXT NOT NULL,
    "seedEmailId" TEXT NOT NULL,
    "seedEmailAddress" TEXT NOT NULL,
    "messageId" TEXT,
    "subject" TEXT,
    "senderName" TEXT,
    "senderEmail" TEXT,
    "placement" TEXT NOT NULL DEFAULT 'inbox',
    "preview" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WinRedInboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WinRedInboxMessage_seedEmailAddress_idx" ON "WinRedInboxMessage"("seedEmailAddress");

-- CreateIndex
CREATE INDEX "WinRedInboxMessage_receivedAt_idx" ON "WinRedInboxMessage"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WinRedInboxMessage_seedEmailId_messageId_key" ON "WinRedInboxMessage"("seedEmailId", "messageId");
