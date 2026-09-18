-- Create a parallel user-scoped table so the currently deployed application can
-- continue reading the legacy client-scoped table until this release is live.
CREATE TABLE "CiUserEntitySubscription" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CiUserEntitySubscription_pkey" PRIMARY KEY ("id")
);

-- Preserve today's effective behavior: every current teammate starts with a
-- personal copy of every entity their client already follows. They can diverge
-- independently after deployment.
INSERT INTO "CiUserEntitySubscription" ("id", "clientId", "userId", "entityId", "createdAt", "updatedAt")
SELECT
    'user_follow_' || md5(subscription."id" || ':' || app_user."id"),
    subscription."clientId",
    app_user."id",
    subscription."entityId",
    subscription."createdAt",
    subscription."updatedAt"
FROM "CiEntitySubscription" AS subscription
JOIN "User" AS app_user ON app_user."clientId" = subscription."clientId";

CREATE UNIQUE INDEX "CiUserEntitySubscription_userId_entityId_key"
    ON "CiUserEntitySubscription"("userId", "entityId");
CREATE INDEX "CiUserEntitySubscription_clientId_userId_idx"
    ON "CiUserEntitySubscription"("clientId", "userId");
CREATE INDEX "CiUserEntitySubscription_entityId_idx"
    ON "CiUserEntitySubscription"("entityId");

ALTER TABLE "CiUserEntitySubscription"
    ADD CONSTRAINT "CiUserEntitySubscription_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CiUserEntitySubscription"
    ADD CONSTRAINT "CiUserEntitySubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CiUserEntitySubscription"
    ADD CONSTRAINT "CiUserEntitySubscription_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "CiEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
