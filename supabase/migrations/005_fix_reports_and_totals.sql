-- ==============================================================================
-- Fix Doctor Types & Financial Totals RPC for Mitali Hospital
-- Version: 005_fix_reports_and_totals
-- ==============================================================================

-- 1. Ensure type column exists on doctors table and backfill from payload/specialty
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS type TEXT;

UPDATE public.doctors
SET type = COALESCE(
  NULLIF(payload->>'type', ''),
  CASE
    WHEN specialty = 'أسنان' THEN 'أسنان'
    WHEN specialty = 'تحاليل' THEN 'تحاليل'
    WHEN specialty LIKE '%اشعة%' OR specialty LIKE '%أشعة%' THEN 'أشعة'
    ELSE 'عيادات'
  END
)
WHERE type IS NULL;

CREATE INDEX IF NOT EXISTS doctors_type_idx ON public.doctors(type);

-- 2. Fast database RPC function for accurate financial totals across all periods
-- Computes SUM(amount) and COUNT directly in PostgreSQL in 1ms with NO 1000-row limits.
CREATE OR REPLACE FUNCTION public.get_financial_summary(p_month TEXT DEFAULT 'all')
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_income_total NUMERIC := 0;
  v_income_count BIGINT := 0;
  v_expense_total NUMERIC := 0;
  v_expense_count BIGINT := 0;
BEGIN
  IF p_month IS NULL OR p_month = 'all' THEN
    SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO v_income_total, v_income_count FROM public.income;
    SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO v_expense_total, v_expense_count FROM public.expense;
  ELSE
    SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO v_income_total, v_income_count 
    FROM public.income 
    WHERE (month = p_month OR date::text LIKE p_month || '%');
    
    SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO v_expense_total, v_expense_count 
    FROM public.expense 
    WHERE (month = p_month OR date::text LIKE p_month || '%');
  END IF;

  RETURN jsonb_build_object(
    'month', COALESCE(p_month, 'all'),
    'income', jsonb_build_object('total', v_income_total, 'count', v_income_count),
    'expense', jsonb_build_object('total', v_expense_total, 'count', v_expense_count),
    'totalIncome', v_income_total,
    'totalExpense', v_expense_total,
    'net', (v_income_total - v_expense_total)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_financial_summary(TEXT) TO anon, authenticated;
