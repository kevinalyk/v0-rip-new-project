-- CreateTable EmailClickEvent
CREATE TABLE "EmailClickEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailType" TEXT NOT NULL,
    "linkType" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "referrer" TEXT,
    "userAgent" TEXT,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailClickEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailClickEvent_userId_idx" ON "EmailClickEvent"("userId");

-- CreateIndex
CREATE INDEX "EmailClickEvent_emailType_idx" ON "EmailClickEvent"("emailType");

-- CreateIndex
CREATE INDEX "EmailClickEvent_linkType_idx" ON "EmailClickEvent"("linkType");

-- CreateIndex
CREATE INDEX "EmailClickEvent_clickedAt_idx" ON "EmailClickEvent"("clickedAt");
