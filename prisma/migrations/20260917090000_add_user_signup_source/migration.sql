-- Attribute self-service registrations to their originating product surface.
-- Existing users and all callers that do not explicitly identify as iOS remain "web".
ALTER TABLE "User"
ADD COLUMN "signupSource" TEXT NOT NULL DEFAULT 'web';
