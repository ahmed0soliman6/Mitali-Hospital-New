-- ==============================================================================
-- Sync All Hospital Staff Accounts to Supabase Auth & Profiles
-- Version: 006_sync_all_staff_accounts_to_auth
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  usr_id UUID;
  existing_id UUID;
BEGIN
  -- Account: عبدالعاطى (د عبدالعاطى ياسن)
  SELECT id INTO existing_id FROM auth.users WHERE email = 'u-2lnyqniv2kfzhni52kfyt9mj@accounts.mitali-hospital.internal';
  IF existing_id IS NULL THEN
    usr_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      usr_id,
      'authenticated',
      'authenticated',
      'u-2lnyqniv2kfzhni52kfyt9mj@accounts.mitali-hospital.internal',
      crypt('123456', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"د عبدالعاطى ياسن"}'::jsonb,
      NOW(),
      NOW()
    );
  ELSE
    usr_id := existing_id;
  END IF;

  -- Insert or update public.profiles
  INSERT INTO public.profiles (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id, 'عبدالعاطى', 'د عبدالعاطى ياسن', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"radiology":{"add":false,"view":false,"edit":false,"delete":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"outstandingBalancesClinic":{"view":false},"patientFilesClinic":{"view":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"labs":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"outstandingBalancesRadiology":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"clinic":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"dental":{"delete":false,"add":true,"view":true,"edit":true},"outstandingBalancesDental":{"view":true},"patientFilesDental":{"view":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Insert or update public.staff_accounts
  INSERT INTO public.staff_accounts (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id::text, 'عبدالعاطى', 'د عبدالعاطى ياسن', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"radiology":{"add":false,"view":false,"edit":false,"delete":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"outstandingBalancesClinic":{"view":false},"patientFilesClinic":{"view":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"labs":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"outstandingBalancesRadiology":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"clinic":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"dental":{"delete":false,"add":true,"view":true,"edit":true},"outstandingBalancesDental":{"view":true},"patientFilesDental":{"view":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Account: ولاء (ولاء محمد)
  SELECT id INTO existing_id FROM auth.users WHERE email = 'u-2yjzhnin2ke@accounts.mitali-hospital.internal';
  IF existing_id IS NULL THEN
    usr_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      usr_id,
      'authenticated',
      'authenticated',
      'u-2yjzhnin2ke@accounts.mitali-hospital.internal',
      crypt('123456', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"ولاء محمد"}'::jsonb,
      NOW(),
      NOW()
    );
  ELSE
    usr_id := existing_id;
  END IF;

  -- Insert or update public.profiles
  INSERT INTO public.profiles (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id, 'ولاء', 'ولاء محمد', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"radiology":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesDental":{"view":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"patientFilesDental":{"view":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"outstandingBalancesClinic":{"view":false},"patientFilesClinic":{"view":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"labs":{"add":false,"view":false,"edit":false,"delete":false},"dental":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"outstandingBalancesRadiology":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"clinic":{"delete":false,"view":true,"edit":false,"add":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Insert or update public.staff_accounts
  INSERT INTO public.staff_accounts (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id::text, 'ولاء', 'ولاء محمد', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"radiology":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesDental":{"view":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"patientFilesDental":{"view":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"outstandingBalancesClinic":{"view":false},"patientFilesClinic":{"view":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"labs":{"add":false,"view":false,"edit":false,"delete":false},"dental":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"outstandingBalancesRadiology":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"clinic":{"delete":false,"view":true,"edit":false,"add":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Account: العجمى (علاء العجمى)
  SELECT id INTO existing_id FROM auth.users WHERE email = 'u-2kfzhni52kzzhdmj@accounts.mitali-hospital.internal';
  IF existing_id IS NULL THEN
    usr_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      usr_id,
      'authenticated',
      'authenticated',
      'u-2kfzhni52kzzhdmj@accounts.mitali-hospital.internal',
      crypt('123456', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"علاء العجمى"}'::jsonb,
      NOW(),
      NOW()
    );
  ELSE
    usr_id := existing_id;
  END IF;

  -- Insert or update public.profiles
  INSERT INTO public.profiles (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id, 'العجمى', 'علاء العجمى', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"outstandingBalancesDental":{"view":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"patientFilesDental":{"view":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"outstandingBalancesClinic":{"view":false},"patientFilesClinic":{"view":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"labs":{"add":false,"view":false,"edit":false,"delete":false},"dental":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"clinic":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"radiology":{"delete":false,"add":true,"view":true,"edit":true},"outstandingBalancesRadiology":{"view":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Insert or update public.staff_accounts
  INSERT INTO public.staff_accounts (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id::text, 'العجمى', 'علاء العجمى', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"outstandingBalancesDental":{"view":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"patientFilesDental":{"view":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"outstandingBalancesClinic":{"view":false},"patientFilesClinic":{"view":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"labs":{"add":false,"view":false,"edit":false,"delete":false},"dental":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"clinic":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"radiology":{"delete":false,"add":true,"view":true,"edit":true},"outstandingBalancesRadiology":{"view":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Account: منى (د منى عبدالعزيز)
  SELECT id INTO existing_id FROM auth.users WHERE email = 'u-2yxzhtmj@accounts.mitali-hospital.internal';
  IF existing_id IS NULL THEN
    usr_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      usr_id,
      'authenticated',
      'authenticated',
      'u-2yxzhtmj@accounts.mitali-hospital.internal',
      crypt('123456', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"د منى عبدالعزيز"}'::jsonb,
      NOW(),
      NOW()
    );
  ELSE
    usr_id := existing_id;
  END IF;

  -- Insert or update public.profiles
  INSERT INTO public.profiles (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id, 'منى', 'د منى عبدالعزيز', 'موظف', 'نشط', '{"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalances":{"view":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"income":{"add":false,"edit":false,"delete":false,"view":true},"radiology":{"add":false,"edit":false,"delete":false,"view":true},"outstandingBalancesDental":{"view":true},"expense":{"add":false,"edit":false,"delete":false,"view":true},"patientFilesDental":{"view":true},"outstandingBalancesClinic":{"view":true},"patientFilesClinic":{"view":true},"operations":{"add":false,"edit":false,"delete":false,"view":true},"labs":{"add":false,"edit":false,"delete":false,"view":true},"dental":{"add":false,"edit":false,"delete":false,"view":true},"doctors":{"add":false,"edit":false,"delete":false,"view":true},"clinic":{"add":false,"edit":false,"delete":false,"view":true},"employees":{"add":false,"edit":false,"delete":false,"view":true},"dashboard":{"view":true},"outstandingBalancesLabs":{"view":true},"outstandingBalancesOperations":{"view":true},"outstandingBalancesRadiology":{"view":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Insert or update public.staff_accounts
  INSERT INTO public.staff_accounts (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id::text, 'منى', 'د منى عبدالعزيز', 'موظف', 'نشط', '{"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalances":{"view":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"income":{"add":false,"edit":false,"delete":false,"view":true},"radiology":{"add":false,"edit":false,"delete":false,"view":true},"outstandingBalancesDental":{"view":true},"expense":{"add":false,"edit":false,"delete":false,"view":true},"patientFilesDental":{"view":true},"outstandingBalancesClinic":{"view":true},"patientFilesClinic":{"view":true},"operations":{"add":false,"edit":false,"delete":false,"view":true},"labs":{"add":false,"edit":false,"delete":false,"view":true},"dental":{"add":false,"edit":false,"delete":false,"view":true},"doctors":{"add":false,"edit":false,"delete":false,"view":true},"clinic":{"add":false,"edit":false,"delete":false,"view":true},"employees":{"add":false,"edit":false,"delete":false,"view":true},"dashboard":{"view":true},"outstandingBalancesLabs":{"view":true},"outstandingBalancesOperations":{"view":true},"outstandingBalancesRadiology":{"view":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Account: ندى (ندى)
  SELECT id INTO existing_id FROM auth.users WHERE email = 'u-2ybyr9mj@accounts.mitali-hospital.internal';
  IF existing_id IS NULL THEN
    usr_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      usr_id,
      'authenticated',
      'authenticated',
      'u-2ybyr9mj@accounts.mitali-hospital.internal',
      crypt('123456', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"ندى"}'::jsonb,
      NOW(),
      NOW()
    );
  ELSE
    usr_id := existing_id;
  END IF;

  -- Insert or update public.profiles
  INSERT INTO public.profiles (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id, 'ندى', 'ندى', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"radiology":{"add":false,"view":false,"edit":false,"delete":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"labs":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"outstandingBalancesRadiology":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"outstandingBalancesDental":{"view":true},"patientFilesDental":{"view":true},"outstandingBalancesClinic":{"view":true},"patientFilesClinic":{"view":true},"dental":{"delete":false,"view":true,"edit":false,"add":true},"clinic":{"delete":false,"view":true,"edit":false,"add":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Insert or update public.staff_accounts
  INSERT INTO public.staff_accounts (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id::text, 'ندى', 'ندى', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"radiology":{"add":false,"view":false,"edit":false,"delete":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"labs":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"outstandingBalancesRadiology":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"outstandingBalancesDental":{"view":true},"patientFilesDental":{"view":true},"outstandingBalancesClinic":{"view":true},"patientFilesClinic":{"view":true},"dental":{"delete":false,"view":true,"edit":false,"add":true},"clinic":{"delete":false,"view":true,"edit":false,"add":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Account: admin (مدير النظام)
  SELECT id INTO existing_id FROM auth.users WHERE email = 'u-ywrtaw4@accounts.mitali-hospital.internal';
  IF existing_id IS NULL THEN
    usr_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      usr_id,
      'authenticated',
      'authenticated',
      'u-ywrtaw4@accounts.mitali-hospital.internal',
      crypt('123456', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"مدير النظام"}'::jsonb,
      NOW(),
      NOW()
    );
  ELSE
    usr_id := existing_id;
  END IF;

  -- Insert or update public.profiles
  INSERT INTO public.profiles (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id, 'admin', 'مدير النظام', 'مدير', 'نشط', '{"dashboard":{"view":true},"doctors":{"view":true,"add":true,"edit":true,"delete":true},"employees":{"view":true,"add":true,"edit":true,"delete":true},"clinic":{"view":true,"add":true,"edit":true,"delete":true},"dental":{"view":true,"add":true,"edit":true,"delete":true},"operations":{"view":true,"add":true,"edit":true,"delete":true},"labs":{"view":true,"add":true,"edit":true,"delete":true},"radiology":{"view":true,"add":true,"edit":true,"delete":true},"patientFilesClinic":{"view":true},"patientFilesDental":{"view":true},"income":{"view":true,"add":true,"edit":true,"delete":true},"expense":{"view":true,"add":true,"edit":true,"delete":true},"ledger":{"view":true},"outstandingBalancesClinic":{"view":true},"outstandingBalancesDental":{"view":true},"outstandingBalancesOperations":{"view":true},"outstandingBalancesLabs":{"view":true},"outstandingBalancesRadiology":{"view":true},"outstandingBalances":{"view":false},"reports":{"view":true},"payroll":{"view":true,"add":true,"edit":true,"delete":true},"categories":{"view":true,"add":true,"edit":true,"delete":true},"users":{"view":true,"add":true,"edit":true,"delete":true,"editPerms":true},"settings":{"edit":true,"backup":true,"restore":true},"demoData":{"view":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Insert or update public.staff_accounts
  INSERT INTO public.staff_accounts (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id::text, 'admin', 'مدير النظام', 'مدير', 'نشط', '{"dashboard":{"view":true},"doctors":{"view":true,"add":true,"edit":true,"delete":true},"employees":{"view":true,"add":true,"edit":true,"delete":true},"clinic":{"view":true,"add":true,"edit":true,"delete":true},"dental":{"view":true,"add":true,"edit":true,"delete":true},"operations":{"view":true,"add":true,"edit":true,"delete":true},"labs":{"view":true,"add":true,"edit":true,"delete":true},"radiology":{"view":true,"add":true,"edit":true,"delete":true},"patientFilesClinic":{"view":true},"patientFilesDental":{"view":true},"income":{"view":true,"add":true,"edit":true,"delete":true},"expense":{"view":true,"add":true,"edit":true,"delete":true},"ledger":{"view":true},"outstandingBalancesClinic":{"view":true},"outstandingBalancesDental":{"view":true},"outstandingBalancesOperations":{"view":true},"outstandingBalancesLabs":{"view":true},"outstandingBalancesRadiology":{"view":true},"outstandingBalances":{"view":false},"reports":{"view":true},"payroll":{"view":true,"add":true,"edit":true,"delete":true},"categories":{"view":true,"add":true,"edit":true,"delete":true},"users":{"view":true,"add":true,"edit":true,"delete":true,"editPerms":true},"settings":{"edit":true,"backup":true,"restore":true},"demoData":{"view":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Account: نشوى (نشوه السيد يوسف)
  SELECT id INTO existing_id FROM auth.users WHERE email = 'u-2ybytnmi2yk@accounts.mitali-hospital.internal';
  IF existing_id IS NULL THEN
    usr_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      usr_id,
      'authenticated',
      'authenticated',
      'u-2ybytnmi2yk@accounts.mitali-hospital.internal',
      crypt('123456', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"نشوه السيد يوسف"}'::jsonb,
      NOW(),
      NOW()
    );
  ELSE
    usr_id := existing_id;
  END IF;

  -- Insert or update public.profiles
  INSERT INTO public.profiles (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id, 'نشوى', 'نشوه السيد يوسف', 'موظف', 'نشط', '{"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"outstandingBalancesDental":{"view":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"outstandingBalancesClinic":{"view":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"outstandingBalancesRadiology":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"income":{"delete":false,"add":true,"view":true,"edit":true},"operations":{"delete":false,"add":true,"view":true,"edit":true},"labs":{"delete":false,"add":true,"view":true,"edit":true},"dental":{"delete":false,"add":true,"view":true,"edit":true},"radiology":{"delete":false,"add":true,"view":true,"edit":true},"clinic":{"delete":false,"add":true,"view":true,"edit":true},"expense":{"delete":false,"add":true,"view":true,"edit":true},"patientFilesDental":{"view":true},"patientFilesClinic":{"view":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Insert or update public.staff_accounts
  INSERT INTO public.staff_accounts (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id::text, 'نشوى', 'نشوه السيد يوسف', 'موظف', 'نشط', '{"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"outstandingBalancesDental":{"view":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"outstandingBalancesClinic":{"view":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"outstandingBalancesRadiology":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"income":{"delete":false,"add":true,"view":true,"edit":true},"operations":{"delete":false,"add":true,"view":true,"edit":true},"labs":{"delete":false,"add":true,"view":true,"edit":true},"dental":{"delete":false,"add":true,"view":true,"edit":true},"radiology":{"delete":false,"add":true,"view":true,"edit":true},"clinic":{"delete":false,"add":true,"view":true,"edit":true},"expense":{"delete":false,"add":true,"view":true,"edit":true},"patientFilesDental":{"view":true},"patientFilesClinic":{"view":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Account: مشعل (احمد مشعل)
  SELECT id INTO existing_id FROM auth.users WHERE email = 'u-2yxytni52yq@accounts.mitali-hospital.internal';
  IF existing_id IS NULL THEN
    usr_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      usr_id,
      'authenticated',
      'authenticated',
      'u-2yxytni52yq@accounts.mitali-hospital.internal',
      crypt('123456', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"احمد مشعل"}'::jsonb,
      NOW(),
      NOW()
    );
  ELSE
    usr_id := existing_id;
  END IF;

  -- Insert or update public.profiles
  INSERT INTO public.profiles (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id, 'مشعل', 'احمد مشعل', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"outstandingBalancesDental":{"view":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"patientFilesDental":{"view":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"outstandingBalancesClinic":{"view":false},"patientFilesClinic":{"view":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"labs":{"add":false,"view":false,"edit":false,"delete":false},"dental":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"clinic":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"outstandingBalancesRadiology":{"view":true},"radiology":{"add":true,"view":true,"edit":true,"delete":false}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Insert or update public.staff_accounts
  INSERT INTO public.staff_accounts (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id::text, 'مشعل', 'احمد مشعل', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"outstandingBalancesDental":{"view":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"patientFilesDental":{"view":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"outstandingBalancesClinic":{"view":false},"patientFilesClinic":{"view":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"labs":{"add":false,"view":false,"edit":false,"delete":false},"dental":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"clinic":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"outstandingBalancesRadiology":{"view":true},"radiology":{"add":true,"view":true,"edit":true,"delete":false}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Account: غاده (غاده)
  SELECT id INTO existing_id FROM auth.users WHERE email = 'u-2lryp9iv2yc@accounts.mitali-hospital.internal';
  IF existing_id IS NULL THEN
    usr_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      usr_id,
      'authenticated',
      'authenticated',
      'u-2lryp9iv2yc@accounts.mitali-hospital.internal',
      crypt('123456', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"غاده"}'::jsonb,
      NOW(),
      NOW()
    );
  ELSE
    usr_id := existing_id;
  END IF;

  -- Insert or update public.profiles
  INSERT INTO public.profiles (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id, 'غاده', 'غاده', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"radiology":{"add":false,"view":false,"edit":false,"delete":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"labs":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"outstandingBalancesRadiology":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"outstandingBalancesDental":{"view":true},"patientFilesDental":{"view":true},"outstandingBalancesClinic":{"view":true},"patientFilesClinic":{"view":true},"dental":{"delete":false,"view":true,"edit":false,"add":true},"clinic":{"delete":false,"view":true,"edit":false,"add":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Insert or update public.staff_accounts
  INSERT INTO public.staff_accounts (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id::text, 'غاده', 'غاده', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"radiology":{"add":false,"view":false,"edit":false,"delete":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"labs":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"outstandingBalancesRadiology":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"outstandingBalancesDental":{"view":true},"patientFilesDental":{"view":true},"outstandingBalancesClinic":{"view":true},"patientFilesClinic":{"view":true},"dental":{"delete":false,"view":true,"edit":false,"add":true},"clinic":{"delete":false,"view":true,"edit":false,"add":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Account: العدل (العدل)
  SELECT id INTO existing_id FROM auth.users WHERE email = 'u-2kfzhni52k_zha@accounts.mitali-hospital.internal';
  IF existing_id IS NULL THEN
    usr_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      usr_id,
      'authenticated',
      'authenticated',
      'u-2kfzhni52k_zha@accounts.mitali-hospital.internal',
      crypt('123456', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"العدل"}'::jsonb,
      NOW(),
      NOW()
    );
  ELSE
    usr_id := existing_id;
  END IF;

  -- Insert or update public.profiles
  INSERT INTO public.profiles (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id, 'العدل', 'العدل', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"outstandingBalancesDental":{"view":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"patientFilesDental":{"view":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"outstandingBalancesClinic":{"view":false},"patientFilesClinic":{"view":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"labs":{"add":false,"view":false,"edit":false,"delete":false},"dental":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"clinic":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"radiology":{"delete":false,"add":true,"view":true,"edit":true},"outstandingBalancesRadiology":{"view":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Insert or update public.staff_accounts
  INSERT INTO public.staff_accounts (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id::text, 'العدل', 'العدل', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"outstandingBalancesDental":{"view":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"patientFilesDental":{"view":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"outstandingBalancesClinic":{"view":false},"patientFilesClinic":{"view":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"labs":{"add":false,"view":false,"edit":false,"delete":false},"dental":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"clinic":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"radiology":{"delete":false,"add":true,"view":true,"edit":true},"outstandingBalancesRadiology":{"view":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Account: شيماء (شيماء سامى)
  SELECT id INTO existing_id FROM auth.users WHERE email = 'u-2ltzitmf2kfyoq@accounts.mitali-hospital.internal';
  IF existing_id IS NULL THEN
    usr_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      usr_id,
      'authenticated',
      'authenticated',
      'u-2ltzitmf2kfyoq@accounts.mitali-hospital.internal',
      crypt('123456', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"شيماء سامى"}'::jsonb,
      NOW(),
      NOW()
    );
  ELSE
    usr_id := existing_id;
  END IF;

  -- Insert or update public.profiles
  INSERT INTO public.profiles (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id, 'شيماء', 'شيماء سامى', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"radiology":{"add":false,"view":false,"edit":false,"delete":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"labs":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"outstandingBalancesRadiology":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"outstandingBalancesDental":{"view":true},"patientFilesDental":{"view":true},"outstandingBalancesClinic":{"view":true},"patientFilesClinic":{"view":true},"dental":{"delete":false,"view":true,"edit":false,"add":true},"clinic":{"delete":false,"view":true,"edit":false,"add":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Insert or update public.staff_accounts
  INSERT INTO public.staff_accounts (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id::text, 'شيماء', 'شيماء سامى', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalancesLabs":{"view":false},"outstandingBalances":{"view":false},"radiology":{"add":false,"view":false,"edit":false,"delete":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"labs":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"outstandingBalancesRadiology":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"outstandingBalancesDental":{"view":true},"patientFilesDental":{"view":true},"outstandingBalancesClinic":{"view":true},"patientFilesClinic":{"view":true},"dental":{"delete":false,"view":true,"edit":false,"add":true},"clinic":{"delete":false,"view":true,"edit":false,"add":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Account: اميرة (اميرة)
  SELECT id INTO existing_id FROM auth.users WHERE email = 'u-2kfzhdmk2lhyqq@accounts.mitali-hospital.internal';
  IF existing_id IS NULL THEN
    usr_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      usr_id,
      'authenticated',
      'authenticated',
      'u-2kfzhdmk2lhyqq@accounts.mitali-hospital.internal',
      crypt('123456', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"اميرة"}'::jsonb,
      NOW(),
      NOW()
    );
  ELSE
    usr_id := existing_id;
  END IF;

  -- Insert or update public.profiles
  INSERT INTO public.profiles (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id, 'اميرة', 'اميرة', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalances":{"view":false},"radiology":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesDental":{"view":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"patientFilesDental":{"view":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"outstandingBalancesClinic":{"view":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"dental":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"outstandingBalancesRadiology":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"outstandingBalancesLabs":{"view":true},"patientFilesClinic":{"view":true},"labs":{"delete":false,"view":true,"edit":false,"add":true},"clinic":{"view":true,"delete":false,"edit":false,"add":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

  -- Insert or update public.staff_accounts
  INSERT INTO public.staff_accounts (id, username, display_name, role, status, permissions, credential_version, security_version, updated_at)
  VALUES (usr_id::text, 'اميرة', 'اميرة', 'موظف', 'نشط', '{"income":{"add":false,"view":false,"edit":false,"delete":false},"ledger":{"view":false},"reports":{"view":false},"settings":{"backup":false,"restore":false,"edit":false},"outstandingBalances":{"view":false},"radiology":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesDental":{"view":false},"expense":{"add":false,"view":false,"edit":false,"delete":false},"patientFilesDental":{"view":false},"users":{"add":false,"view":false,"edit":false,"editPerms":false,"delete":false},"outstandingBalancesClinic":{"view":false},"operations":{"add":false,"view":false,"edit":false,"delete":false},"dental":{"add":false,"view":false,"edit":false,"delete":false},"doctors":{"add":false,"view":false,"edit":false,"delete":false},"outstandingBalancesOperations":{"view":false},"outstandingBalancesRadiology":{"view":false},"categories":{"add":false,"view":false,"edit":false,"delete":false},"payroll":{"add":false,"view":false,"edit":false,"delete":false},"employees":{"add":false,"view":false,"edit":false,"delete":false},"dashboard":{"view":false},"outstandingBalancesLabs":{"view":true},"patientFilesClinic":{"view":true},"labs":{"delete":false,"view":true,"edit":false,"add":true},"clinic":{"view":true,"delete":false,"edit":false,"add":true}}'::jsonb, 1, 1, NOW())
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

END $$;
