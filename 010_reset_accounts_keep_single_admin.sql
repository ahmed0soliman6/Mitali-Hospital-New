-- ==============================================================================
-- Reset All User Accounts & Keep ONLY ONE Clean Admin Manager
-- Version: 010_reset_accounts_keep_single_admin
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_admin_id UUID := '11167ba7-4d66-4023-9af1-0d15e60e2c87';
  has_email_col BOOLEAN;
BEGIN
  -- 1. Check if admin exists in auth.users, if not find any manager or create
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_admin_id) THEN
    SELECT id INTO v_admin_id FROM auth.users WHERE email LIKE '%ywrtaw4%' OR email LIKE '%YWRtaW4%' LIMIT 1;
  END IF;

  IF v_admin_id IS NULL THEN
    v_admin_id := '11167ba7-4d66-4023-9af1-0d15e60e2c87';
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_admin_id,
      'authenticated',
      'authenticated',
      'u-ywrtaw4@accounts.mitali-hospital.internal',
      crypt('123456', gen_salt('bf', 10)),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"مدير النظام"}'::jsonb,
      NOW(),
      NOW()
    );
  ELSE
    -- Reset admin password to 123456 and confirm email
    UPDATE auth.users
    SET 
      encrypted_password = crypt('123456', gen_salt('bf', 10)),
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      banned_until = NULL,
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = '{"display_name":"مدير النظام"}'::jsonb,
      updated_at = NOW()
    WHERE id = v_admin_id;
  END IF;

  -- 2. DELETE ALL OTHER USERS FROM auth.users
  DELETE FROM auth.users WHERE id != v_admin_id;

  -- 3. DELETE ALL OTHER IDENTITIES FROM auth.identities
  DELETE FROM auth.identities WHERE user_id != v_admin_id;

  -- Ensure admin has identity in auth.identities
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'email'
  ) INTO has_email_col;

  IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_admin_id) THEN
    IF has_email_col THEN
      BEGIN
        EXECUTE format('
          INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, email, last_sign_in_at, created_at, updated_at)
          VALUES (%L, %L, %L::jsonb, %L, %L, %L, NOW(), NOW(), NOW())
          ON CONFLICT DO NOTHING;
        ', v_admin_id::text, v_admin_id, jsonb_build_object('sub', v_admin_id::text, 'email', 'u-ywrtaw4@accounts.mitali-hospital.internal')::text, 'email', v_admin_id::text, 'u-ywrtaw4@accounts.mitali-hospital.internal');
      EXCEPTION WHEN OTHERS THEN
        EXECUTE format('
          INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
          VALUES (%L, %L, %L::jsonb, %L, %L, NOW(), NOW(), NOW())
          ON CONFLICT DO NOTHING;
        ', v_admin_id::text, v_admin_id, jsonb_build_object('sub', v_admin_id::text, 'email', 'u-ywrtaw4@accounts.mitali-hospital.internal')::text, 'email', v_admin_id::text);
      END;
    ELSE
      EXECUTE format('
        INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
        VALUES (%L, %L, %L::jsonb, %L, %L, NOW(), NOW(), NOW())
        ON CONFLICT DO NOTHING;
      ', v_admin_id::text, v_admin_id, jsonb_build_object('sub', v_admin_id::text, 'email', 'u-ywrtaw4@accounts.mitali-hospital.internal')::text, 'email', v_admin_id::text);
    END IF;
  END IF;

  -- 4. DELETE ALL ROWS FROM public.profiles EXCEPT ADMIN
  DELETE FROM public.profiles WHERE id != v_admin_id;

  INSERT INTO public.profiles (
    id, username, display_name, role, status, permissions,
    credential_version, security_version, created_at, updated_at
  ) VALUES (
    v_admin_id,
    'admin',
    'مدير النظام',
    'مدير',
    'نشط',
    '{"dashboard":{"view":true},"doctors":{"view":true,"add":true,"edit":true,"delete":true},"employees":{"view":true,"add":true,"edit":true,"delete":true},"clinic":{"view":true,"add":true,"edit":true,"delete":true},"dental":{"view":true,"add":true,"edit":true,"delete":true},"operations":{"view":true,"add":true,"edit":true,"delete":true},"labs":{"view":true,"add":true,"edit":true,"delete":true},"radiology":{"view":true,"add":true,"edit":true,"delete":true},"patientFilesClinic":{"view":true},"patientFilesDental":{"view":true},"income":{"view":true,"add":true,"edit":true,"delete":true},"expense":{"view":true,"add":true,"edit":true,"delete":true},"ledger":{"view":true},"outstandingBalancesClinic":{"view":true},"outstandingBalancesDental":{"view":true},"outstandingBalancesOperations":{"view":true},"outstandingBalancesLabs":{"view":true},"outstandingBalancesRadiology":{"view":true},"outstandingBalances":{"view":true},"reports":{"view":true},"payroll":{"view":true,"add":true,"edit":true,"delete":true},"categories":{"view":true,"add":true,"edit":true,"delete":true},"users":{"view":true,"add":true,"edit":true,"delete":true,"editPerms":true},"settings":{"edit":true,"backup":true,"restore":true},"demoData":{"view":true}}'::jsonb,
    1, 1, NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    username = 'admin',
    display_name = 'مدير النظام',
    role = 'مدير',
    status = 'نشط',
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- 5. DELETE ALL ROWS FROM public.staff_accounts EXCEPT ADMIN
  DELETE FROM public.staff_accounts WHERE id != v_admin_id::text;

  INSERT INTO public.staff_accounts (
    id, username, display_name, role, status, permissions,
    credential_version, security_version, created_at, updated_at, payload
  ) VALUES (
    v_admin_id::text,
    'admin',
    'مدير النظام',
    'مدير',
    'نشط',
    '{"dashboard":{"view":true},"doctors":{"view":true,"add":true,"edit":true,"delete":true},"employees":{"view":true,"add":true,"edit":true,"delete":true},"clinic":{"view":true,"add":true,"edit":true,"delete":true},"dental":{"view":true,"add":true,"edit":true,"delete":true},"operations":{"view":true,"add":true,"edit":true,"delete":true},"labs":{"view":true,"add":true,"edit":true,"delete":true},"radiology":{"view":true,"add":true,"edit":true,"delete":true},"patientFilesClinic":{"view":true},"patientFilesDental":{"view":true},"income":{"view":true,"add":true,"edit":true,"delete":true},"expense":{"view":true,"add":true,"edit":true,"delete":true},"ledger":{"view":true},"outstandingBalancesClinic":{"view":true},"outstandingBalancesDental":{"view":true},"outstandingBalancesOperations":{"view":true},"outstandingBalancesLabs":{"view":true},"outstandingBalancesRadiology":{"view":true},"outstandingBalances":{"view":true},"reports":{"view":true},"payroll":{"view":true,"add":true,"edit":true,"delete":true},"categories":{"view":true,"add":true,"edit":true,"delete":true},"users":{"view":true,"add":true,"edit":true,"delete":true,"editPerms":true},"settings":{"edit":true,"backup":true,"restore":true},"demoData":{"view":true}}'::jsonb,
    1, 1, NOW(), NOW(),
    jsonb_build_object(
      'id', v_admin_id::text,
      'username', 'admin',
      'displayName', 'مدير النظام',
      'role', 'مدير',
      'status', 'نشط'
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    username = 'admin',
    display_name = 'مدير النظام',
    role = 'مدير',
    status = 'نشط',
    permissions = EXCLUDED.permissions,
    payload = EXCLUDED.payload,
    updated_at = NOW();

END $$;

-- 6. Open RLS permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;

-- Verification: Should show ONLY ONE row (admin)
SELECT id, username, display_name, role, status FROM public.staff_accounts;
