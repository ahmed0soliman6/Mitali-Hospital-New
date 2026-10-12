-- ==============================================================================
-- Mitali Hospital: Final Complete Fix for Auth Identities & Manager Permissions
-- Version: 008_fix_all_auth_identities_and_permissions
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Ensure all users in auth.users have an active Email provider identity in auth.identities
-- This is MANDATORY for Supabase GoTrue to allow signInWithPassword.
DO $$
DECLARE
  r RECORD;
  has_email BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'email'
  ) INTO has_email;

  FOR r IN SELECT id, email FROM auth.users WHERE id NOT IN (SELECT user_id FROM auth.identities WHERE user_id IS NOT NULL) LOOP
    IF has_email THEN
      BEGIN
        EXECUTE format('
          INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, email, last_sign_in_at, created_at, updated_at)
          VALUES (%L, %L, %L::jsonb, %L, %L, %L, NOW(), NOW(), NOW())
          ON CONFLICT DO NOTHING;
        ', r.id::text, r.id, jsonb_build_object('sub', r.id::text, 'email', r.email)::text, 'email', r.id::text, r.email);
      EXCEPTION WHEN OTHERS THEN
        EXECUTE format('
          INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
          VALUES (%L, %L, %L::jsonb, %L, %L, NOW(), NOW(), NOW())
          ON CONFLICT DO NOTHING;
        ', r.id::text, r.id, jsonb_build_object('sub', r.id::text, 'email', r.email)::text, 'email', r.id::text);
      END;
    ELSE
      EXECUTE format('
        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
        VALUES (%L, %L, %L::jsonb, %L, %L, NOW(), NOW(), NOW())
        ON CONFLICT DO NOTHING;
      ', r.id::text, r.id, jsonb_build_object('sub', r.id::text, 'email', r.email)::text, 'email', r.id::text);
    END IF;
  END LOOP;
END $$;

-- 2. Confirm email and set password '123456' for all staff accounts
UPDATE auth.users
SET 
  encrypted_password = crypt('123456', gen_salt('bf', 10)),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  confirmed_at = COALESCE(confirmed_at, NOW()),
  banned_until = NULL,
  raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
  updated_at = NOW()
WHERE email LIKE '%@accounts.mitali-hospital.internal'
  AND email NOT IN ('u-ywrtaw4@accounts.mitali-hospital.internal', 'u-YWRtaW4@accounts.mitali-hospital.internal');

-- 3. Fix Admin account in profiles & staff_accounts so Manager has FULL permissions
UPDATE public.profiles
SET 
  username = 'admin',
  display_name = 'مدير النظام',
  role = 'مدير',
  status = 'نشط',
  permissions = '{"dashboard":{"view":true},"doctors":{"view":true,"add":true,"edit":true,"delete":true},"employees":{"view":true,"add":true,"edit":true,"delete":true},"clinic":{"view":true,"add":true,"edit":true,"delete":true},"dental":{"view":true,"add":true,"edit":true,"delete":true},"operations":{"view":true,"add":true,"edit":true,"delete":true},"labs":{"view":true,"add":true,"edit":true,"delete":true},"radiology":{"view":true,"add":true,"edit":true,"delete":true},"patientFilesClinic":{"view":true},"patientFilesDental":{"view":true},"income":{"view":true,"add":true,"edit":true,"delete":true},"expense":{"view":true,"add":true,"edit":true,"delete":true},"ledger":{"view":true},"outstandingBalancesClinic":{"view":true},"outstandingBalancesDental":{"view":true},"outstandingBalancesOperations":{"view":true},"outstandingBalancesLabs":{"view":true},"outstandingBalancesRadiology":{"view":true},"outstandingBalances":{"view":true},"reports":{"view":true},"payroll":{"view":true,"add":true,"edit":true,"delete":true},"categories":{"view":true,"add":true,"edit":true,"delete":true},"users":{"view":true,"add":true,"edit":true,"delete":true,"editPerms":true},"settings":{"edit":true,"backup":true,"restore":true},"demoData":{"view":true}}'::jsonb,
  updated_at = NOW()
WHERE id IN (SELECT id FROM auth.users WHERE email LIKE '%ywrtaw4%' OR email LIKE '%YWRtaW4%') OR role = 'مدير' OR username IN ('admin', 'مدير النظام');

UPDATE public.staff_accounts
SET 
  username = 'admin',
  display_name = 'مدير النظام',
  role = 'مدير',
  status = 'نشط',
  permissions = '{"dashboard":{"view":true},"doctors":{"view":true,"add":true,"edit":true,"delete":true},"employees":{"view":true,"add":true,"edit":true,"delete":true},"clinic":{"view":true,"add":true,"edit":true,"delete":true},"dental":{"view":true,"add":true,"edit":true,"delete":true},"operations":{"view":true,"add":true,"edit":true,"delete":true},"labs":{"view":true,"add":true,"edit":true,"delete":true},"radiology":{"view":true,"add":true,"edit":true,"delete":true},"patientFilesClinic":{"view":true},"patientFilesDental":{"view":true},"income":{"view":true,"add":true,"edit":true,"delete":true},"expense":{"view":true,"add":true,"edit":true,"delete":true},"ledger":{"view":true},"outstandingBalancesClinic":{"view":true},"outstandingBalancesDental":{"view":true},"outstandingBalancesOperations":{"view":true},"outstandingBalancesLabs":{"view":true},"outstandingBalancesRadiology":{"view":true},"outstandingBalances":{"view":true},"reports":{"view":true},"payroll":{"view":true,"add":true,"edit":true,"delete":true},"categories":{"view":true,"add":true,"edit":true,"delete":true},"users":{"view":true,"add":true,"edit":true,"delete":true,"editPerms":true},"settings":{"edit":true,"backup":true,"restore":true},"demoData":{"view":true}}'::jsonb,
  updated_at = NOW()
WHERE id IN (SELECT id::text FROM auth.users WHERE email LIKE '%ywrtaw4%' OR email LIKE '%YWRtaW4%') OR role = 'مدير' OR username IN ('admin', 'مدير النظام');

-- 4. Clean up usernames in profiles so each user logs in with their standard name
UPDATE public.profiles SET username = 'نشوه' WHERE username LIKE '%نشوه%';
UPDATE public.profiles SET username = 'علاء' WHERE username LIKE '%علاء%';
UPDATE public.profiles SET username = 'منى' WHERE username LIKE '%منى%';
UPDATE public.profiles SET username = 'ندى' WHERE username LIKE '%ندى%';
UPDATE public.profiles SET username = 'احمد' WHERE username LIKE '%احمد%';
UPDATE public.profiles SET username = 'غاده' WHERE username LIKE '%غاده%';
UPDATE public.profiles SET username = 'العدل' WHERE username LIKE '%العدل%';
UPDATE public.profiles SET username = 'شيماء' WHERE username LIKE '%شيماء%';
UPDATE public.profiles SET username = 'عبدالعاطى' WHERE username LIKE '%عبدالعاطى%';
UPDATE public.profiles SET username = 'اميرة' WHERE username LIKE '%اميرة%';
UPDATE public.profiles SET username = 'ولاء' WHERE username LIKE '%ولاء%';

-- Synchronize staff_accounts from profiles
UPDATE public.staff_accounts sa
SET 
  username = p.username,
  display_name = p.display_name,
  role = p.role,
  status = p.status,
  permissions = p.permissions,
  updated_at = NOW()
FROM public.profiles p
WHERE p.id::text = sa.id;

-- 5. Open RLS permissions for application access
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;

-- Verification Query: Shows provider status for every user
SELECT 
  au.id as auth_uuid,
  au.email,
  p.username as login_username,
  p.display_name,
  p.role,
  CASE WHEN EXISTS (SELECT 1 FROM auth.identities ai WHERE ai.user_id = au.id) THEN '✅ Email Active' ELSE '❌ No Provider' END as provider_status,
  CASE WHEN p.id IS NOT NULL THEN '✅ Profile OK' ELSE '❌ Missing Profile' END as profile_status
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE au.email LIKE '%@accounts.mitali-hospital.internal'
ORDER BY au.created_at;
