-- ==============================================================================
-- Mitali Hospital / Supabase Complete Relational Setup Script
-- Paste and Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Delete old unified table if you want a complete clean migration:
DROP TABLE IF EXISTS public.data_records CASCADE;

-- 2. Helper function to keep explicit columns and JSONB payload synchronized automatically
CREATE OR REPLACE FUNCTION public.sync_explicit_table_payload()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payload IS NULL THEN
    NEW.payload = '{}'::jsonb;
  END IF;

  -- Extract payload fields to explicit columns if column is empty
  IF NEW.patient IS NULL OR NEW.patient = '' THEN
    NEW.patient = COALESCE(NULLIF(NEW.payload->>'patient', ''), NULLIF(NEW.payload->>'name', ''));
  END IF;
  IF NEW.phone IS NULL OR NEW.phone = '' THEN
    NEW.phone = NULLIF(NEW.payload->>'phone', '');
  END IF;
  IF NEW.file_no IS NULL OR NEW.file_no = '' THEN
    NEW.file_no = NULLIF(NEW.payload->>'fileNo', '');
  END IF;
  IF NEW.date IS NULL OR NEW.date = '' THEN
    NEW.date = COALESCE(NULLIF(NEW.payload->>'date', ''), NULLIF(NEW.payload->>'lastVisitDate', ''));
  END IF;
  IF NEW.month IS NULL OR NEW.month = '' THEN
    NEW.month = COALESCE(NULLIF(NEW.payload->>'month', ''), SUBSTRING(NEW.date FROM 1 FOR 7));
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
  IF NEW.status IS NULL OR NEW.status = '' THEN
    NEW.status = NULLIF(NEW.payload->>'status', '');
  END IF;
  IF NEW.notes IS NULL OR NEW.notes = '' THEN
    NEW.notes = NULLIF(NEW.payload->>'notes', '');
  END IF;
  IF NEW.linked_income_id IS NULL OR NEW.linked_income_id = '' THEN
    NEW.linked_income_id = NULLIF(NEW.payload->>'linkedIncomeId', '');
  END IF;

  -- Update payload to match explicit columns
  NEW.payload = NEW.payload || jsonb_build_object(
    'id', NEW.id,
    'date', COALESCE(NEW.date, NEW.payload->>'date', ''),
    'month', COALESCE(NEW.month, NEW.payload->>'month', ''),
    'patient', COALESCE(NEW.patient, NEW.payload->>'patient', ''),
    'phone', COALESCE(NEW.phone, NEW.payload->>'phone', ''),
    'fileNo', COALESCE(NEW.file_no, NEW.payload->>'fileNo', ''),
    'doctorId', COALESCE(NEW.doctor_id, NEW.payload->>'doctorId', ''),
    'doctorName', COALESCE(NEW.doctor_name, NEW.payload->>'doctorName', ''),
    'examType', COALESCE(NEW.exam_type, NEW.payload->>'examType', ''),
    'status', COALESCE(NEW.status, NEW.payload->>'status', ''),
    'notes', COALESCE(NEW.notes, NEW.payload->>'notes', ''),
    'linkedIncomeId', COALESCE(NEW.linked_income_id, NEW.payload->>'linkedIncomeId', '')
  );

  IF NEW.total IS NOT NULL THEN
    NEW.payload = jsonb_set(NEW.payload, '{total}', to_jsonb(NEW.total));
  END IF;
  IF NEW.paid IS NOT NULL THEN
    NEW.payload = jsonb_set(NEW.payload, '{paid}', to_jsonb(NEW.paid));
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 3. Dynamic loop to construct explicit tables, indexes, RLS, and triggers
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'visits_clinic', 'visits_dental', 'visits_operations', 'visits_labs', 'visits_radiology',
    'income', 'expense', 'lab_expenses', 'payroll', 'doctors', 'employees',
    'patient_file_index_clinic', 'patient_file_index_dental', 'patient_file_index',
    'patient_files_clinic', 'patient_files_dental', 'settings', 'categories', 'specialties', 'outbox', 'audit_log'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE FORMAT('
      CREATE TABLE IF NOT EXISTS public.%I (
        id TEXT PRIMARY KEY,
        date TEXT,
        month TEXT,
        file_no TEXT,
        patient TEXT,
        phone TEXT,
        doctor_id TEXT,
        doctor_name TEXT,
        exam_type TEXT,
        services JSONB DEFAULT ''[]''::jsonb,
        total NUMERIC DEFAULT 0,
        paid NUMERIC DEFAULT 0,
        payment_method TEXT,
        status TEXT,
        notes TEXT,
        linked_income_id TEXT,
        next_visit_date TEXT,
        payload JSONB NOT NULL DEFAULT ''{}''::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS %I_date_idx ON public.%I(date DESC, id DESC);
      CREATE INDEX IF NOT EXISTS %I_month_idx ON public.%I(month DESC, id DESC);
      CREATE INDEX IF NOT EXISTS %I_patient_idx ON public.%I(patient);
      CREATE INDEX IF NOT EXISTS %I_phone_idx ON public.%I(phone);
      CREATE INDEX IF NOT EXISTS %I_file_no_idx ON public.%I(file_no);
      CREATE INDEX IF NOT EXISTS %I_doctor_idx ON public.%I(doctor_id);
      CREATE INDEX IF NOT EXISTS %I_status_idx ON public.%I(status);
      CREATE INDEX IF NOT EXISTS %I_updated_idx ON public.%I(updated_at DESC);

      ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS %I_allow_all ON public.%I;
      DROP POLICY IF EXISTS %I_read ON public.%I;
      DROP POLICY IF EXISTS %I_insert ON public.%I;
      DROP POLICY IF EXISTS %I_update ON public.%I;
      DROP POLICY IF EXISTS %I_delete ON public.%I;

      CREATE POLICY %I_read ON public.%I FOR SELECT USING (public.has_permission(''%s'', ''view''));
      CREATE POLICY %I_insert ON public.%I FOR INSERT WITH CHECK (public.has_permission(''%s'', ''add''));
      CREATE POLICY %I_update ON public.%I FOR UPDATE USING (public.has_permission(''%s'', ''edit'')) WITH CHECK (public.has_permission(''%s'', ''edit''));
      CREATE POLICY %I_delete ON public.%I FOR DELETE USING (public.has_permission(''%s'', ''delete''));

      DROP TRIGGER IF EXISTS %I_sync_payload ON public.%I;
      CREATE TRIGGER %I_sync_payload
      BEFORE INSERT OR UPDATE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.sync_explicit_table_payload();
    ', 
    tbl, 
    tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl,
    tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl,
    tbl, tbl, tbl,
    tbl, tbl, tbl,
    tbl, tbl, tbl, tbl,
    tbl, tbl, tbl,
    tbl, tbl, tbl, tbl);
  END LOOP;
END $$;

-- 4. Enable Realtime on all new explicit tables in Supabase
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'visits_clinic', 'visits_dental', 'visits_operations', 'visits_labs', 'visits_radiology',
    'income', 'expense', 'lab_expenses', 'payroll', 'doctors', 'employees',
    'patient_file_index_clinic', 'patient_file_index_dental', 'settings', 'categories', 'audit_log'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE FORMAT('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;
