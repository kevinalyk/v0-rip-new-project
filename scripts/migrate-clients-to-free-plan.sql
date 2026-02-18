-- Set all existing clients to free plan except RIP
UPDATE "Client"
SET "subscriptionPlan" = 'free'
WHERE id != 'rip';

-- Optional: Update RIP to 'enterprise' if needed
-- UPDATE "Client"
-- SET "subscriptionPlan" = 'enterprise'
-- WHERE id = 'rip';
