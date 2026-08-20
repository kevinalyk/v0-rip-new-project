-- CreateTable: capture why a client cancelled, collected at the moment they confirm cancellation
CREATE TABLE "SubscriptionCancellationFeedback" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "subscriptionType" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionCancellationFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionCancellationFeedback_clientId_idx" ON "SubscriptionCancellationFeedback"("clientId");

-- CreateIndex
CREATE INDEX "SubscriptionCancellationFeedback_reason_idx" ON "SubscriptionCancellationFeedback"("reason");

-- CreateIndex
CREATE INDEX "SubscriptionCancellationFeedback_createdAt_idx" ON "SubscriptionCancellationFeedback"("createdAt");
