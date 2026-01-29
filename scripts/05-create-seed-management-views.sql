-- Create views and helper functions for seed email management

-- View for seed email assignments
CREATE OR REPLACE VIEW "SeedEmailAssignmentView" AS
SELECT 
    se.id as seed_email_id,
    se.email as seed_email,
    se.provider,
    se.active as seed_email_active,
    se."ownedByClient" as owned_by,
    se."assignedToClient" as assigned_to,
    se."createdAt" as created_at,
    CASE 
        WHEN se."assignedToClient" IS NULL THEN 'Available in Pool'
        ELSE 'Assigned'
    END as assignment_status
FROM "SeedEmail" se
ORDER BY se."ownedByClient", se."assignedToClient", se.provider, se.email;

-- Function to get available RIP seeds (not assigned to anyone)
CREATE OR REPLACE FUNCTION get_available_rip_seeds()
RETURNS TABLE(
    seed_email_id TEXT,
    email TEXT,
    provider TEXT,
    active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        se.id,
        se.email,
        se.provider,
        se.active
    FROM "SeedEmail" se
    WHERE se."ownedByClient" = 'RIP'
    AND se."assignedToClient" IS NULL
    AND se.active = true
    ORDER BY se.provider, se.email;
END;
$$ LANGUAGE plpgsql;

-- Function to get seeds assigned to a specific client
CREATE OR REPLACE FUNCTION get_client_seeds(target_client_name TEXT)
RETURNS TABLE(
    seed_email_id TEXT,
    email TEXT,
    provider TEXT,
    active BOOLEAN,
    owned_by TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        se.id,
        se.email,
        se.provider,
        se.active,
        se."ownedByClient"
    FROM "SeedEmail" se
    WHERE se."assignedToClient" = target_client_name
    AND se.active = true
    ORDER BY se.provider, se.email;
END;
$$ LANGUAGE plpgsql;

-- Show current state
SELECT * FROM "SeedEmailAssignmentView";

-- Show summary statistics
SELECT 
    owned_by,
    assignment_status,
    COUNT(*) as count
FROM "SeedEmailAssignmentView"
GROUP BY owned_by, assignment_status
ORDER BY owned_by, assignment_status;

SELECT 'Seed email management views and functions created' as status;
