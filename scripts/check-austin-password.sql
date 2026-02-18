-- Check current user info for austin@redsparkstrategy.com
-- Note: This will show the hashed password, not the plain text

SELECT 
  id,
  email,
  "firstName",
  "lastName",
  role,
  "firstLogin",
  "createdAt",
  password as hashed_password
FROM "User" 
WHERE email = 'austin@redsparkstrategy.com';

-- If you need to reset Austin's password to a known value, uncomment below:
-- UPDATE "User" 
-- SET password = '$2a$10$YQZ8qF7X9vK2nL4mP6wR8eH3jT5sA1bC9dE2fG7hI8jK3lM4nO5pQ6r', -- "TempAdmin2024!"
--     "firstLogin" = true,
--     "updatedAt" = NOW()
-- WHERE email = 'austin@redsparkstrategy.com';
