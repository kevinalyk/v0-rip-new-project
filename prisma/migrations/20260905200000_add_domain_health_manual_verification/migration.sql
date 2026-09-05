-- Self-reported verification state for Domain Health checks that cannot be fully
-- automated (e.g. "Unsubscribe Honored Within 2 Days", "Spam Rate Below 0.10%").
-- Stored as { [checkId]: { verifiedAt, verifiedByUserId, verifiedByEmail } }.
ALTER TABLE "ClientDomain"
  ADD COLUMN "manualCheckVerifications" JSONB NOT NULL DEFAULT '{}';
