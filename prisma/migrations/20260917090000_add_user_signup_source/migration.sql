-- Attribute self-service registrations to their originating product surface.
-- Existing users and all callers that do not explicitly identify as iOS remain "web".
ALTER TABLE "User"
ADD COLUMN "signupSource" TEXT NOT NULL DEFAULT 'web';

-- New installations default app-level notification categories on. Apple system
-- authorization remains the controlling permission, and existing rows are unchanged.
ALTER TABLE "MobilePushToken"
ALTER COLUMN "followingEnabled" SET DEFAULT true;
