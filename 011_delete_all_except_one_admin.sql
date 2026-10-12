-- ==============================================================================
-- Delete all duplicate manager and staff accounts - KEEP ONLY admin
-- Version: 011_delete_all_except_one_admin
-- ==============================================================================

-- 1. Remove all records from staff_accounts where username is not 'admin'
DELETE FROM public.staff_accounts 
WHERE username != 'admin';

-- 2. Remove all records from profiles where username is not 'admin'
DELETE FROM public.profiles 
WHERE username != 'admin';

-- 3. If there are multiple 'admin' rows in staff_accounts or profiles, keep only the one matching auth.users
DELETE FROM public.staff_accounts 
WHERE username = 'admin' 
  AND id NOT IN (SELECT id::text FROM auth.users);

DELETE FROM public.profiles 
WHERE username = 'admin' 
  AND id NOT IN (SELECT id FROM auth.users);

-- 4. Verify exactly ONE admin row in both tables
SELECT 'staff_accounts' as tbl, id, username, display_name, role, status FROM public.staff_accounts
UNION ALL
SELECT 'profiles' as tbl, id::text, username, display_name, role, status FROM public.profiles;
