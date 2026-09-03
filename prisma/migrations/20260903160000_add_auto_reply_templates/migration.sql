-- Add auto-reply preview/header fields to DomainHealthEmailSample
ALTER TABLE "DomainHealthEmailSample"
  ADD COLUMN "emailPreview" TEXT,
  ADD COLUMN "rawHeadersSnippet" TEXT;

-- New AutoReplyTemplate table
CREATE TABLE "AutoReplyTemplate" (
    "id" TEXT NOT NULL,
    "messageType" TEXT,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoReplyTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutoReplyTemplate_messageType_idx" ON "AutoReplyTemplate"("messageType");
