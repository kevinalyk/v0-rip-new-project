-- Tracks when a domain-health email sample that landed in spam for a *verified* client domain
-- was automatically moved to the inbox. `placement` is left untouched ("spam") so we retain the
-- historical fact that it originally misfired — these two columns only record the correction.
ALTER TABLE "DomainHealthEmailSample"
  ADD COLUMN "correctedToInbox" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "correctedAt" TIMESTAMP(3);
