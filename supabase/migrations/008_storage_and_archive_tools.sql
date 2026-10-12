-- 008_storage_and_archive_tools.sql
-- Support storage metrics and annual archive purging

CREATE OR REPLACE FUNCTION public.get_database_size()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT pg_database_size(current_database());
$$;

GRANT EXECUTE ON FUNCTION public.get_database_size() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.purge_year_data(p_year text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start date;
  v_end date;
  v_clinic_cnt int := 0;
  v_dental_cnt int := 0;
  v_ops_cnt int := 0;
  v_labs_cnt int := 0;
  v_rad_cnt int := 0;
  v_inc_cnt int := 0;
  v_exp_cnt int := 0;
  v_labexp_cnt int := 0;
  v_total int := 0;
BEGIN
  IF p_year IS NULL OR p_year !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'invalid-year-format';
  END IF;

  v_start := (p_year || '-01-01')::date;
  v_end := (p_year || '-12-31')::date;

  -- 1. Clinic visits
  WITH del AS (DELETE FROM public.visits_clinic WHERE date >= v_start AND date <= v_end RETURNING id)
  SELECT count(*) INTO v_clinic_cnt FROM del;

  -- 2. Dental visits
  WITH del AS (DELETE FROM public.visits_dental WHERE date >= v_start AND date <= v_end RETURNING id)
  SELECT count(*) INTO v_dental_cnt FROM del;

  -- 3. Operations visits
  WITH del AS (DELETE FROM public.visits_operations WHERE date >= v_start AND date <= v_end RETURNING id)
  SELECT count(*) INTO v_ops_cnt FROM del;

  -- 4. Labs visits
  WITH del AS (DELETE FROM public.visits_labs WHERE date >= v_start AND date <= v_end RETURNING id)
  SELECT count(*) INTO v_labs_cnt FROM del;

  -- 5. Radiology visits
  WITH del AS (DELETE FROM public.visits_radiology WHERE date >= v_start AND date <= v_end RETURNING id)
  SELECT count(*) INTO v_rad_cnt FROM del;

  -- 6. Income
  WITH del AS (DELETE FROM public.income WHERE date >= v_start AND date <= v_end RETURNING id)
  SELECT count(*) INTO v_inc_cnt FROM del;

  -- 7. Expense
  WITH del AS (DELETE FROM public.expense WHERE date >= v_start AND date <= v_end RETURNING id)
  SELECT count(*) INTO v_exp_cnt FROM del;

  -- 8. Lab Expenses
  WITH del AS (DELETE FROM public.lab_expenses WHERE month LIKE (p_year || '-%') RETURNING id)
  SELECT count(*) INTO v_labexp_cnt FROM del;

  v_total := v_clinic_cnt + v_dental_cnt + v_ops_cnt + v_labs_cnt + v_rad_cnt + v_inc_cnt + v_exp_cnt + v_labexp_cnt;

  RETURN jsonb_build_object(
    'ok', true,
    'year', p_year,
    'totalDeleted', v_total,
    'deleted', jsonb_build_object(
      'visitsClinic', v_clinic_cnt,
      'visitsDental', v_dental_cnt,
      'visitsOperations', v_ops_cnt,
      'visitsLabs', v_labs_cnt,
      'visitsRadiology', v_rad_cnt,
      'income', v_inc_cnt,
      'expense', v_exp_cnt,
      'labExpenses', v_labexp_cnt
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_year_data(text) TO authenticated, service_role;
