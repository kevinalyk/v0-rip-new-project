-- Add paidUserSeats column to Client table
-- This tracks the total number of user seats already paid for in manual/custom subscriptions
-- When set, the system will only charge for seats beyond this number

ALTER TABLE "Client" 
ADD COLUMN IF NOT EXISTS "paidUserSeats" INTEGER;

-- Add comment to explain the column
COMMENT ON COLUMN "Client"."paidUserSeats" IS 'Total user seats already paid for (used for custom/manual subscriptions). When set, system only charges for seats beyond this number.';
