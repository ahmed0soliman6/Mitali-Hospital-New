-- ==============================================================================
-- 1. CLEAN ALL DUPLICATE STAFF ACCOUNTS
-- ==============================================================================
-- Keep only the single account matching auth.users for each username
DELETE FROM public.staff_accounts
WHERE id NOT IN (SELECT id::text FROM auth.users)
  AND username IN (
    SELECT username FROM public.staff_accounts 
    WHERE id IN (SELECT id::text FROM auth.users)
  );

-- Also remove duplicates by keeping only the newest entry if multiple remain
DELETE FROM public.staff_accounts a
USING public.staff_accounts b
WHERE a.username = b.username
  AND a.created_at < b.created_at;

-- Keep profiles clean as well
DELETE FROM public.profiles
WHERE id NOT IN (SELECT id FROM auth.users);

-- ==============================================================================
-- 2. CREATE ULTRA-FAST RPC FUNCTION FOR WIPING BUSINESS DATA
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.wipe_business_data()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deleted JSONB := '{}'::jsonb;
  v_count BIGINT := 0;
  v_total BIGINT := 0;
BEGIN
  -- Truncate / delete all business data tables
  DELETE FROM public.visits_clinic;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{visits_clinic}', to_jsonb(v_count));
  v_total := v_total + v_count;

  DELETE FROM public.visits_dental;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{visits_dental}', to_jsonb(v_count));
  v_total := v_total + v_count;

  DELETE FROM public.visits_operations;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{visits_operations}', to_jsonb(v_count));
  v_total := v_total + v_count;

  DELETE FROM public.visits_labs;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{visits_labs}', to_jsonb(v_count));
  v_total := v_total + v_count;

  DELETE FROM public.visits_radiology;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{visits_radiology}', to_jsonb(v_count));
  v_total := v_total + v_count;

  DELETE FROM public.income;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{income}', to_jsonb(v_count));
  v_total := v_total + v_count;

  DELETE FROM public.expense;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{expense}', to_jsonb(v_count));
  v_total := v_total + v_count;

  DELETE FROM public.lab_expenses;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{lab_expenses}', to_jsonb(v_count));
  v_total := v_total + v_count;

  DELETE FROM public.patient_file_index_clinic;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{patient_file_index_clinic}', to_jsonb(v_count));
  v_total := v_total + v_count;

  DELETE FROM public.patient_file_index_dental;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := jsonb_set(v_deleted, '{patient_file_index_dental}', to_jsonb(v_count));
  v_total := v_total + v_count;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'patient_file_index') THEN
    DELETE FROM public.patient_file_index;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'patient_files_clinic') THEN
    DELETE FROM public.patient_files_clinic;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'patient_files_dental') THEN
    DELETE FROM public.patient_files_dental;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_log') THEN
    DELETE FROM public.audit_log;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'wipeId', 'wipe_' || floor(extract(epoch from now()) * 1000)::text,
    'totalDeleted', v_total,
    'deleted', v_deleted,
    'preserveAccounts', true,
    'preserveSettings', true,
    'preserveDoctors', true,
    'preserveEmployees', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wipe_business_data() TO anon, authenticated;

-- ==============================================================================
-- 3. VERIFY UNIQUE STAFF ACCOUNTS
-- ==============================================================================
SELECT id, username, display_name, role, status, created_at 
FROM public.staff_accounts 
ORDER BY username;
