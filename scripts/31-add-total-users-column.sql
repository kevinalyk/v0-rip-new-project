-- Add totalUsers column to Client table
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "totalUsers" INTEGER NOT NULL DEFAULT 0;

-- Populate with current user counts
UPDATE "Client" c
SET "totalUsers" = (
  SELECT COUNT(*)
  FROM "User" u
  WHERE u."clientId" = c.id
);

-- Create function to update totalUsers count
CREATE OR REPLACE FUNCTION update_client_total_users()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment totalUsers when a user is added
    IF NEW."clientId" IS NOT NULL THEN
      UPDATE "Client"
      SET "totalUsers" = "totalUsers" + 1
      WHERE id = NEW."clientId";
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement totalUsers when a user is deleted
    IF OLD."clientId" IS NOT NULL THEN
      UPDATE "Client"
      SET "totalUsers" = "totalUsers" - 1
      WHERE id = OLD."clientId";
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle clientId changes
    IF OLD."clientId" IS DISTINCT FROM NEW."clientId" THEN
      -- Decrement from old client
      IF OLD."clientId" IS NOT NULL THEN
        UPDATE "Client"
        SET "totalUsers" = "totalUsers" - 1
        WHERE id = OLD."clientId";
      END IF;
      -- Increment to new client
      IF NEW."clientId" IS NOT NULL THEN
        UPDATE "Client"
        SET "totalUsers" = "totalUsers" + 1
        WHERE id = NEW."clientId";
      END IF;
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update totalUsers
DROP TRIGGER IF EXISTS trigger_update_client_total_users ON "User";
CREATE TRIGGER trigger_update_client_total_users
AFTER INSERT OR UPDATE OR DELETE ON "User"
FOR EACH ROW
EXECUTE FUNCTION update_client_total_users();

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS "Client_totalUsers_idx" ON "Client"("totalUsers");

-- Verify counts are correct
DO $$
DECLARE
  client_record RECORD;
  actual_count INTEGER;
BEGIN
  FOR client_record IN SELECT id, "totalUsers" FROM "Client" LOOP
    SELECT COUNT(*) INTO actual_count FROM "User" WHERE "clientId" = client_record.id;
    IF client_record."totalUsers" != actual_count THEN
      RAISE NOTICE 'Client % has incorrect count: stored=%, actual=%', 
        client_record.id, client_record."totalUsers", actual_count;
      UPDATE "Client" SET "totalUsers" = actual_count WHERE id = client_record.id;
    END IF;
  END LOOP;
END $$;
