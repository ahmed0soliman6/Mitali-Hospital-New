-- ==============================================================================
-- Mitali Hospital / Supabase Complete Relational Setup & Safe Migration Script
-- Version: 003_explicit_relational_tables (Safe, Non-Destructive, Entity-Specific)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Helper functions for safe parsing without zeroing out values
CREATE OR REPLACE FUNCTION public.safe_numeric(val TEXT)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF val IS NULL OR TRIM(val) = '' THEN
    RETURN NULL;
  END IF;
  RETURN TRIM(val)::NUMERIC;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.safe_date(val TEXT)
RETURNS DATE LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF val IS NULL OR TRIM(val) = '' THEN
    RETURN NULL;
  END IF;
  RETURN TRIM(val)::DATE;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- 2. Non-mutating trigger function: NEVER alters or inflates NEW.payload
CREATE OR REPLACE FUNCTION public.sync_explicit_table_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_visit_table_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.patient IS NULL OR NEW.patient = '' THEN
    NEW.patient = COALESCE(NULLIF(NEW.payload->>'patient', ''), NULLIF(NEW.payload->>'name', ''));
  END IF;
  IF NEW.phone IS NULL OR NEW.phone = '' THEN
    NEW.phone = NULLIF(NEW.payload->>'phone', '');
  END IF;
  IF NEW.file_no IS NULL OR NEW.file_no = '' THEN
    NEW.file_no = NULLIF(NEW.payload->>'fileNo', '');
  END IF;
  IF NEW.date IS NULL THEN
    NEW.date = public.safe_date(COALESCE(NULLIF(NEW.payload->>'date', ''), NULLIF(NEW.payload->>'lastVisitDate', '')));
  END IF;
  IF NEW.month IS NULL OR NEW.month = '' THEN
    NEW.month = COALESCE(NULLIF(NEW.payload->>'month', ''), SUBSTRING(NEW.date::text FROM 1 FOR 7));
  END IF;
  IF NEW.doctor_id IS NULL OR NEW.doctor_id = '' THEN
    NEW.doctor_id = COALESCE(NULLIF(NEW.payload->>'doctorId', ''), NULLIF(NEW.payload->>'docId', ''));
  END IF;
  IF NEW.doctor_name IS NULL OR NEW.doctor_name = '' THEN
    NEW.doctor_name = NULLIF(NEW.payload->>'doctorName', '');
  END IF;
  IF NEW.exam_type IS NULL OR NEW.exam_type = '' THEN
    NEW.exam_type = COALESCE(NULLIF(NEW.payload->>'examType', ''), NULLIF(NEW.payload->>'type', ''));
  END IF;
  IF NEW.total IS NULL THEN
    NEW.total = public.safe_numeric(COALESCE(NEW.payload->>'total', NEW.payload->>'amount'));
  END IF;
  IF NEW.paid IS NULL THEN
    NEW.paid = public.safe_numeric(COALESCE(NEW.payload->>'paid', NEW.payload->>'paidAmount'));
  END IF;
  IF NEW.status IS NULL OR NEW.status = '' THEN
    NEW.status = NULLIF(NEW.payload->>'status', '');
  END IF;
  IF NEW.notes IS NULL OR NEW.notes = '' THEN
    NEW.notes = NULLIF(NEW.payload->>'notes', '');
  END IF;
  IF NEW.linked_income_id IS NULL OR NEW.linked_income_id = '' THEN
    NEW.linked_income_id = NULLIF(NEW.payload->>'linkedIncomeId', '');
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Construct entity-specific tables, ensure all columns exist, indexes, and optimized RLS policies
DO $$
DECLARE
  tbl TEXT;
  visit_tbls TEXT[] := ARRAY[
    'visits_clinic', 'visits_dental', 'visits_operations', 'visits_labs', 'visits_radiology'
  ];
  finance_tbls TEXT[] := ARRAY[
    'income', 'expense', 'lab_expenses'
  ];
  index_tbls TEXT[] := ARRAY[
    'patient_file_index_clinic', 'patient_file_index_dental', 'patient_file_index',
    'patient_files_clinic', 'patient_files_dental'
  ];
  config_tbls TEXT[] := ARRAY[
    'settings', 'categories', 'specialties'
  ];
  all_tables TEXT[] := ARRAY[
    'visits_clinic', 'visits_dental', 'visits_operations', 'visits_labs', 'visits_radiology',
    'income', 'expense', 'lab_expenses', 'payroll', 'doctors', 'employees',
    'patient_file_index_clinic', 'patient_file_index_dental', 'patient_file_index',
    'patient_files_clinic', 'patient_files_dental', 'settings', 'categories', 'specialties',
    'audit_log'
  ];
BEGIN
  -- A. Visit Tables
  FOREACH tbl IN ARRAY visit_tbls LOOP
    EXECUTE FORMAT('
      CREATE TABLE IF NOT EXISTS public.%1$I (id TEXT PRIMARY KEY);
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS date DATE;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS month TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS file_no TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS patient TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS phone TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS doctor_id TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS doctor_name TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS exam_type TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS services JSONB DEFAULT ''[]''::jsonb;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS total NUMERIC(12,2);
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS paid NUMERIC(12,2);
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS payment_method TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS status TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS linked_income_id TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS next_visit_date DATE;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT ''{}''::jsonb;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

      CREATE INDEX IF NOT EXISTS %1$I_date_idx ON public.%1$I(date DESC, id DESC);
      CREATE INDEX IF NOT EXISTS %1$I_month_idx ON public.%1$I(month DESC, id DESC);
      CREATE INDEX IF NOT EXISTS %1$I_patient_idx ON public.%1$I(patient);
      CREATE INDEX IF NOT EXISTS %1$I_phone_idx ON public.%1$I(phone);
      CREATE INDEX IF NOT EXISTS %1$I_file_no_idx ON public.%1$I(file_no);
      CREATE INDEX IF NOT EXISTS %1$I_doctor_idx ON public.%1$I(doctor_id);
      CREATE INDEX IF NOT EXISTS %1$I_status_idx ON public.%1$I(status);
      CREATE INDEX IF NOT EXISTS %1$I_updated_idx ON public.%1$I(updated_at DESC);

      DROP TRIGGER IF EXISTS %1$I_sync_columns ON public.%1$I;
      CREATE TRIGGER %1$I_sync_columns
      BEFORE INSERT OR UPDATE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.sync_visit_table_columns();
    ', tbl);
  END LOOP;

  -- B. Finance Tables (income, expense, lab_expenses)
  FOREACH tbl IN ARRAY finance_tbls LOOP
    EXECUTE FORMAT('
      CREATE TABLE IF NOT EXISTS public.%1$I (id TEXT PRIMARY KEY);
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS date DATE;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS month TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS party TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS category TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS description TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2);
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS payment_method TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS receipt_no TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS linked_visit_id TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT ''{}''::jsonb;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

      CREATE INDEX IF NOT EXISTS %1$I_date_idx ON public.%1$I(date DESC, id DESC);
      CREATE INDEX IF NOT EXISTS %1$I_month_idx ON public.%1$I(month DESC, id DESC);
      CREATE INDEX IF NOT EXISTS %1$I_category_idx ON public.%1$I(category);
      CREATE INDEX IF NOT EXISTS %1$I_updated_idx ON public.%1$I(updated_at DESC);

      DROP TRIGGER IF EXISTS %1$I_sync_ts ON public.%1$I;
      CREATE TRIGGER %1$I_sync_ts
      BEFORE INSERT OR UPDATE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.sync_explicit_table_timestamp();
    ', tbl);
  END LOOP;

  -- C. Payroll
  CREATE TABLE IF NOT EXISTS public.payroll (id TEXT PRIMARY KEY);
  ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS month TEXT;
  ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS date DATE;
  ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS employee_id TEXT;
  ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS employee_name TEXT;
  ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS role TEXT;
  ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2);
  ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS salary NUMERIC(12,2);
  ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS bonus NUMERIC(12,2);
  ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS deductions NUMERIC(12,2);
  ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS net_salary NUMERIC(12,2);
  ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS status TEXT;
  ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS payment_method TEXT;
  ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS notes TEXT;
  ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
  ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

  CREATE INDEX IF NOT EXISTS payroll_month_idx ON public.payroll(month DESC, id DESC);
  CREATE INDEX IF NOT EXISTS payroll_date_idx ON public.payroll(date DESC, id DESC);
  CREATE INDEX IF NOT EXISTS payroll_emp_idx ON public.payroll(employee_id);

  -- D. Doctors
  CREATE TABLE IF NOT EXISTS public.doctors (id TEXT PRIMARY KEY);
  ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS name TEXT;
  ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS specialty TEXT;
  ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS phone TEXT;
  ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS fee_mode TEXT;
  ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS clinic_pct NUMERIC(5,2);
  ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS doc_pct NUMERIC(5,2);
  ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS checkup_clinic_fee NUMERIC(12,2);
  ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS status TEXT;
  ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
  ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

  CREATE INDEX IF NOT EXISTS doctors_name_idx ON public.doctors(name);
  CREATE INDEX IF NOT EXISTS doctors_status_idx ON public.doctors(status);

  -- E. Employees
  CREATE TABLE IF NOT EXISTS public.employees (id TEXT PRIMARY KEY);
  ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS name TEXT;
  ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS role TEXT;
  ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone TEXT;
  ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS base_salary NUMERIC(12,2);
  ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS status TEXT;
  ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
  ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

  CREATE INDEX IF NOT EXISTS employees_name_idx ON public.employees(name);
  CREATE INDEX IF NOT EXISTS employees_status_idx ON public.employees(status);

  -- F. Patient File Indexes
  FOREACH tbl IN ARRAY index_tbls LOOP
    EXECUTE FORMAT('
      CREATE TABLE IF NOT EXISTS public.%1$I (id TEXT PRIMARY KEY);
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS name TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS phone TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS file_no TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS patient_key TEXT;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS last_visit_date DATE;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS visits_count INTEGER;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS total_paid NUMERIC(12,2);
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS total_due NUMERIC(12,2);
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT ''{}''::jsonb;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

      CREATE INDEX IF NOT EXISTS %1$I_name_idx ON public.%1$I(name);
      CREATE INDEX IF NOT EXISTS %1$I_phone_idx ON public.%1$I(phone);
      CREATE INDEX IF NOT EXISTS %1$I_file_no_idx ON public.%1$I(file_no);
      CREATE INDEX IF NOT EXISTS %1$I_last_visit_idx ON public.%1$I(last_visit_date DESC);
    ', tbl);
  END LOOP;

  -- G. Config & Settings
  FOREACH tbl IN ARRAY config_tbls LOOP
    EXECUTE FORMAT('
      CREATE TABLE IF NOT EXISTS public.%1$I (id TEXT PRIMARY KEY);
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS value JSONB;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT ''{}''::jsonb;
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE public.%1$I ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ', tbl);
  END LOOP;

  -- H. Audit Log
  CREATE TABLE IF NOT EXISTS public.audit_log (id TEXT PRIMARY KEY);
  ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS date DATE;
  ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS user_id TEXT;
  ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS action TEXT;
  ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS module TEXT;
  ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
  ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

  CREATE INDEX IF NOT EXISTS audit_log_date_idx ON public.audit_log(date DESC, id DESC);

  -- I. High-Performance RLS Policies using (SELECT public.has_permission(...))
  FOREACH tbl IN ARRAY all_tables LOOP
    EXECUTE FORMAT('
      ALTER TABLE public.%1$I ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS %1$I_allow_all ON public.%1$I;
      DROP POLICY IF EXISTS %1$I_read ON public.%1$I;
      DROP POLICY IF EXISTS %1$I_insert ON public.%1$I;
      DROP POLICY IF EXISTS %1$I_update ON public.%1$I;
      DROP POLICY IF EXISTS %1$I_delete ON public.%1$I;

      CREATE POLICY %1$I_read ON public.%1$I FOR SELECT USING ((SELECT public.has_permission(''%1$s'', ''view'')));
      CREATE POLICY %1$I_insert ON public.%1$I FOR INSERT WITH CHECK ((SELECT public.has_permission(''%1$s'', ''add'')));
      CREATE POLICY %1$I_update ON public.%1$I FOR UPDATE USING ((SELECT public.has_permission(''%1$s'', ''edit''))) WITH CHECK ((SELECT public.has_permission(''%1$s'', ''edit'')));
      CREATE POLICY %1$I_delete ON public.%1$I FOR DELETE USING ((SELECT public.has_permission(''%1$s'', ''delete'')));
    ', tbl);
  END LOOP;
END $$;

-- 4. Safe Data Migration from data_records to Explicit Tables
DO $$
DECLARE
  v_count_old BIGINT;
  v_count_new BIGINT;
  v_total_old NUMERIC;
  v_total_new NUMERIC;
  v_paid_old NUMERIC;
  v_paid_new NUMERIC;
  v_legacy_name TEXT := 'data_records_legacy_' || to_char(now(), 'YYYYMMDD');
  tbl TEXT;
  visit_tbls TEXT[] := ARRAY['visits_clinic', 'visits_dental', 'visits_operations', 'visits_labs', 'visits_radiology'];
  finance_tbls TEXT[] := ARRAY['income', 'expense', 'lab_expenses'];
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'data_records') THEN
    RAISE NOTICE 'Starting safe data migration from public.data_records...';

    -- A. Copy Visit tables
    FOREACH tbl IN ARRAY visit_tbls LOOP
      EXECUTE FORMAT('
        INSERT INTO public.%1$I (
          id, date, month, file_no, patient, phone, doctor_id, doctor_name,
          exam_type, services, total, paid, payment_method, status, notes,
          linked_income_id, next_visit_date, payload, created_at, updated_at
        )
        SELECT
          id,
          public.safe_date(COALESCE(NULLIF(date_text, ''''), NULLIF(payload->>''date'', ''''), NULLIF(payload->>''lastVisitDate'', ''''))),
          COALESCE(NULLIF(month_text, ''''), NULLIF(payload->>''month'', ''''), SUBSTRING(COALESCE(date_text, payload->>''date'') FROM 1 FOR 7)),
          NULLIF(payload->>''fileNo'', ''''),
          COALESCE(NULLIF(payload->>''patient'', ''''), NULLIF(payload->>''name'', '''')),
          NULLIF(payload->>''phone'', ''''),
          COALESCE(NULLIF(payload->>''doctorId'', ''''), NULLIF(payload->>''docId'', '''')),
          NULLIF(payload->>''doctorName'', ''''),
          COALESCE(NULLIF(payload->>''examType'', ''''), NULLIF(payload->>''type'', '''')),
          COALESCE(payload->''services'', ''[]''::jsonb),
          public.safe_numeric(COALESCE(payload->>''total'', payload->>''amount'')),
          public.safe_numeric(COALESCE(payload->>''paid'', payload->>''paidAmount'')),
          NULLIF(payload->>''paymentMethod'', ''''),
          NULLIF(payload->>''status'', ''''),
          NULLIF(payload->>''notes'', ''''),
          NULLIF(payload->>''linkedIncomeId'', ''''),
          public.safe_date(NULLIF(payload->>''nextVisitDate'', '''')),
          payload,
          COALESCE(created_at, NOW()),
          COALESCE(updated_at, NOW())
        FROM public.data_records
        WHERE collection = ''%1$s''
        ON CONFLICT (id) DO UPDATE SET
          payload = EXCLUDED.payload,
          updated_at = EXCLUDED.updated_at;
      ', tbl);

      -- Check row count and financial sums consistency
      EXECUTE FORMAT('SELECT COUNT(*), COALESCE(SUM(public.safe_numeric(COALESCE(payload->>''total'', payload->>''amount''))), 0), COALESCE(SUM(public.safe_numeric(COALESCE(payload->>''paid'', payload->>''paidAmount''))), 0) FROM public.data_records WHERE collection = ''%1$s''', tbl)
      INTO v_count_old, v_total_old, v_paid_old;

      EXECUTE FORMAT('SELECT COUNT(*), COALESCE(SUM(total), 0), COALESCE(SUM(paid), 0) FROM public.%1$I', tbl)
      INTO v_count_new, v_total_new, v_paid_new;

      IF v_count_new < v_count_old THEN
        RAISE EXCEPTION 'Migration count mismatch for table %: expected %, got %', tbl, v_count_old, v_count_new;
      END IF;
      IF v_total_new <> v_total_old OR v_paid_new <> v_paid_old THEN
        RAISE EXCEPTION 'Migration financial totals mismatch for table %: total % vs %, paid % vs %', tbl, v_total_old, v_total_new, v_paid_old, v_paid_new;
      END IF;
      RAISE NOTICE 'Table % migrated: % rows, total=%, paid=% (100%% match)', tbl, v_count_new, v_total_new, v_paid_new;
    END LOOP;

    -- B. Copy Finance tables (income, expense, lab_expenses)
    FOREACH tbl IN ARRAY finance_tbls LOOP
      EXECUTE FORMAT('
        INSERT INTO public.%1$I (
          id, date, month, party, category, description, amount,
          payment_method, receipt_no, notes, linked_visit_id,
          payload, created_at, updated_at
        )
        SELECT
          id,
          public.safe_date(COALESCE(NULLIF(date_text, ''''), NULLIF(payload->>''date'', ''''))),
          COALESCE(NULLIF(month_text, ''''), NULLIF(payload->>''month'', ''''), SUBSTRING(COALESCE(date_text, payload->>''date'') FROM 1 FOR 7)),
          COALESCE(NULLIF(payload->>''party'', ''''), NULLIF(payload->>''patient'', '''')),
          NULLIF(payload->>''category'', ''''),
          NULLIF(payload->>''description'', ''''),
          public.safe_numeric(COALESCE(payload->>''amount'', payload->>''total'', payload->>''paid'')),
          NULLIF(payload->>''paymentMethod'', ''''),
          NULLIF(payload->>''receiptNo'', ''''),
          NULLIF(payload->>''notes'', ''''),
          COALESCE(NULLIF(payload->>''linkedVisitId'', ''''), NULLIF(payload->>''visitId'', '''')),
          payload,
          COALESCE(created_at, NOW()),
          COALESCE(updated_at, NOW())
        FROM public.data_records
        WHERE collection = ''%1$s''
        ON CONFLICT (id) DO UPDATE SET
          payload = EXCLUDED.payload,
          updated_at = EXCLUDED.updated_at;
      ', tbl);

      EXECUTE FORMAT('SELECT COUNT(*) FROM public.data_records WHERE collection = ''%1$s''', tbl) INTO v_count_old;
      EXECUTE FORMAT('SELECT COUNT(*) FROM public.%1$I', tbl) INTO v_count_new;
      IF v_count_new < v_count_old THEN
        RAISE EXCEPTION 'Migration count mismatch for table %: expected %, got %', tbl, v_count_old, v_count_new;
      END IF;
      RAISE NOTICE 'Table % migrated: % rows', tbl, v_count_new;
    END LOOP;

    -- C. Copy Payroll
    INSERT INTO public.payroll (
      id, month, date, employee_id, employee_name, role,
      amount, salary, bonus, deductions, net_salary, status, payment_method, notes,
      payload, created_at, updated_at
    )
    SELECT
      id,
      COALESCE(NULLIF(month_text, ''), NULLIF(payload->>'month', '')),
      public.safe_date(COALESCE(NULLIF(date_text, ''), NULLIF(payload->>'date', ''))),
      COALESCE(NULLIF(payload->>'employeeId', ''), NULLIF(payload->>'empId', '')),
      COALESCE(NULLIF(payload->>'employeeName', ''), NULLIF(payload->>'name', '')),
      NULLIF(payload->>'role', ''),
      public.safe_numeric(COALESCE(payload->>'amount', payload->>'netSalary')),
      public.safe_numeric(payload->>'salary'),
      public.safe_numeric(payload->>'bonus'),
      public.safe_numeric(payload->>'deductions'),
      public.safe_numeric(COALESCE(payload->>'netSalary', payload->>'amount')),
      NULLIF(payload->>'status', ''),
      NULLIF(payload->>'paymentMethod', ''),
      NULLIF(payload->>'notes', ''),
      payload,
      COALESCE(created_at, NOW()),
      COALESCE(updated_at, NOW())
    FROM public.data_records
    WHERE collection = 'payroll'
    ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload;

    -- D. Copy Doctors
    INSERT INTO public.doctors (
      id, name, specialty, phone, fee_mode, clinic_pct, doc_pct, checkup_clinic_fee, status,
      payload, created_at, updated_at
    )
    SELECT
      id,
      COALESCE(NULLIF(payload->>'name', ''), 'طبيب بدون اسم'),
      NULLIF(payload->>'specialty', ''),
      NULLIF(payload->>'phone', ''),
      NULLIF(payload->>'feeMode', ''),
      public.safe_numeric(payload->>'clinicPct'),
      public.safe_numeric(payload->>'docPct'),
      public.safe_numeric(payload->>'checkupClinicFee'),
      NULLIF(payload->>'status', ''),
      payload,
      COALESCE(created_at, NOW()),
      COALESCE(updated_at, NOW())
    FROM public.data_records
    WHERE collection = 'doctors'
    ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload;

    -- E. Copy Employees
    INSERT INTO public.employees (
      id, name, role, phone, base_salary, status,
      payload, created_at, updated_at
    )
    SELECT
      id,
      COALESCE(NULLIF(payload->>'name', ''), 'موظف بدون اسم'),
      NULLIF(payload->>'role', ''),
      NULLIF(payload->>'phone', ''),
      public.safe_numeric(payload->>'baseSalary'),
      NULLIF(payload->>'status', ''),
      payload,
      COALESCE(created_at, NOW()),
      COALESCE(updated_at, NOW())
    FROM public.data_records
    WHERE collection = 'employees'
    ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload;

    -- F. Copy Patient Indexes
    INSERT INTO public.patient_file_index_clinic (id, name, phone, file_no, patient_key, last_visit_date, visits_count, total_paid, total_due, payload, created_at, updated_at)
    SELECT id, payload->>'name', payload->>'phone', payload->>'fileNo', payload->>'patientKey', public.safe_date(payload->>'lastVisitDate'), (public.safe_numeric(payload->>'visitsCount'))::int, public.safe_numeric(payload->>'totalPaid'), public.safe_numeric(payload->>'totalDue'), payload, COALESCE(created_at, NOW()), COALESCE(updated_at, NOW())
    FROM public.data_records WHERE collection in ('patient_file_index_clinic', 'patient_files_clinic')
    ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload;

    INSERT INTO public.patient_file_index_dental (id, name, phone, file_no, patient_key, last_visit_date, visits_count, total_paid, total_due, payload, created_at, updated_at)
    SELECT id, payload->>'name', payload->>'phone', payload->>'fileNo', payload->>'patientKey', public.safe_date(payload->>'lastVisitDate'), (public.safe_numeric(payload->>'visitsCount'))::int, public.safe_numeric(payload->>'totalPaid'), public.safe_numeric(payload->>'totalDue'), payload, COALESCE(created_at, NOW()), COALESCE(updated_at, NOW())
    FROM public.data_records WHERE collection in ('patient_file_index_dental', 'patient_files_dental')
    ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload;

    -- G. Copy Configs & Settings
    INSERT INTO public.settings (id, value, payload, created_at, updated_at)
    SELECT id, payload, payload, COALESCE(created_at, NOW()), COALESCE(updated_at, NOW())
    FROM public.data_records WHERE collection = 'settings'
    ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, payload = EXCLUDED.payload;

    INSERT INTO public.categories (id, value, payload, created_at, updated_at)
    SELECT id, payload, payload, COALESCE(created_at, NOW()), COALESCE(updated_at, NOW())
    FROM public.data_records WHERE collection = 'categories'
    ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, payload = EXCLUDED.payload;

    INSERT INTO public.specialties (id, value, payload, created_at, updated_at)
    SELECT id, payload, payload, COALESCE(created_at, NOW()), COALESCE(updated_at, NOW())
    FROM public.data_records WHERE collection = 'specialties'
    ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, payload = EXCLUDED.payload;

    -- H. One-time orphan doctor linking by name (P1-2)
    UPDATE public.visits_clinic v
    SET doctor_id = d.id
    FROM public.doctors d
    WHERE (v.doctor_id IS NULL OR v.doctor_id = '' OR NOT EXISTS (SELECT 1 FROM public.doctors d2 WHERE d2.id = v.doctor_id))
      AND (d.name = v.doctor_name OR d.name = (v.payload->>'doctor') OR d.name = (v.payload->>'doctorName'));

    -- I. Safe Rename: Do NOT DROP data_records! Rename and lock with RLS (no policies).
    EXECUTE FORMAT('ALTER TABLE public.data_records RENAME TO %1$I', v_legacy_name);
    EXECUTE FORMAT('ALTER TABLE public.%1$I ENABLE ROW LEVEL SECURITY', v_legacy_name);
    RAISE NOTICE 'Migration successful. Preserved legacy table as %1$s (RLS active, no policies)', v_legacy_name;
  ELSE
    RAISE NOTICE 'public.data_records does not exist. Schema setup complete.';
  END IF;
END $$;

-- 5. Enable Realtime on explicit tables
DO $$
DECLARE
  tbl TEXT;
  realtime_tbls TEXT[] := ARRAY[
    'visits_clinic', 'visits_dental', 'visits_operations', 'visits_labs', 'visits_radiology',
    'income', 'expense', 'lab_expenses', 'payroll', 'doctors', 'employees',
    'patient_file_index_clinic', 'patient_file_index_dental', 'settings', 'categories', 'audit_log'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH tbl IN ARRAY realtime_tbls LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
      ) THEN
        EXECUTE FORMAT('ALTER PUBLICATION supabase_realtime ADD TABLE public.%1$I', tbl);
      END IF;
    END LOOP;
  END IF;
END $$;
