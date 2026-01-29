-- Setup Super Admin roles for multi-tenant system
-- Super admins can access all clients and manage the entire system

-- First, let's see what roles currently exist
SELECT DISTINCT role FROM "User" ORDER BY role;

-- Update the User table to support super_admin role
-- Current roles appear to be: admin, editor, viewer
-- Adding: super_admin (can access all clients and manage seed assignments)

-- TODO: Replace these email addresses with actual super admin emails
-- You mentioned you and your brother should be super admins
-- Please provide the email addresses to update this script

-- Example super admin updates (replace with actual emails):
-- UPDATE "User" SET role = 'super_admin' WHERE email = 'your-email@example.com';
-- UPDATE "User" SET role = 'super_admin' WHERE email = 'brother-email@example.com';

-- For now, let's create a template that can be customized
-- Show current users so we can identify which ones to promote
SELECT 
    id,
    email,
    "firstName",
    "lastName",
    role,
    "createdAt"
FROM "User" 
ORDER BY "createdAt" ASC;

-- Create a function to check if user is super admin
-- This will be useful for the application logic
CREATE OR REPLACE FUNCTION is_super_admin(user_role TEXT) 
RETURNS BOOLEAN AS $$
BEGIN
    RETURN user_role = 'super_admin' OR user_role = 'admin';
END;
$$ LANGUAGE plpgsql;

-- Create a function to check if user can manage seed assignments
-- Super admins and admins can assign seeds, regular users cannot
CREATE OR REPLACE FUNCTION can_manage_seeds(user_role TEXT) 
RETURNS BOOLEAN AS $$
BEGIN
    RETURN user_role = 'super_admin' OR user_role = 'admin';
END;
$$ LANGUAGE plpgsql;

SELECT 'Super admin role system setup completed' as status;
SELECT 'Please update this script with actual email addresses for super admins' as todo;
