-- Mitali Hospital / Supabase Migration 003: Explicit Relational Tables
-- Creates dedicated explicit relational tables for each department and collection

create extension if not exists pgcrypto;

-- 1. Helper function to keep explicit columns and JSONB payload in sync
create or replace function public.sync_explicit_table_payload()
returns trigger language plpgsql as $$
begin
  if new.payload is null then
    new.payload = '{}'::jsonb;
  end if;

  -- Extract payload fields to explicit columns if column is empty
  if new.patient is null or new.patient = '' then
    new.patient = coalesce(nullif(new.payload->>'patient', ''), nullif(new.payload->>'name', ''));
  end if;
  if new.phone is null or new.phone = '' then
    new.phone = nullif(new.payload->>'phone', '');
  end if;
  if new.file_no is null or new.file_no = '' then
    new.file_no = nullif(new.payload->>'fileNo', '');
  end if;
  if new.date is null or new.date = '' then
    new.date = coalesce(nullif(new.payload->>'date', ''), nullif(new.payload->>'lastVisitDate', ''));
  end if;
  if new.month is null or new.month = '' then
    new.month = coalesce(nullif(new.payload->>'month', ''), substring(new.date from 1 for 7));
  end if;
  if new.doctor_id is null or new.doctor_id = '' then
    new.doctor_id = coalesce(nullif(new.payload->>'doctorId', ''), nullif(new.payload->>'docId', ''));
  end if;
  if new.doctor_name is null or new.doctor_name = '' then
    new.doctor_name = nullif(new.payload->>'doctorName', '');
  end if;
  if new.exam_type is null or new.exam_type = '' then
    new.exam_type = coalesce(nullif(new.payload->>'examType', ''), nullif(new.payload->>'type', ''));
  end if;
  if new.status is null or new.status = '' then
    new.status = nullif(new.payload->>'status', '');
  end if;
  if new.notes is null or new.notes = '' then
    new.notes = nullif(new.payload->>'notes', '');
  end if;
  if new.linked_income_id is null or new.linked_income_id = '' then
    new.linked_income_id = nullif(new.payload->>'linkedIncomeId', '');
  end if;

  -- Update payload to match explicit columns
  new.payload = new.payload || jsonb_build_object(
    'id', new.id,
    'date', coalesce(new.date, new.payload->>'date', ''),
    'month', coalesce(new.month, new.payload->>'month', ''),
    'patient', coalesce(new.patient, new.payload->>'patient', ''),
    'phone', coalesce(new.phone, new.payload->>'phone', ''),
    'fileNo', coalesce(new.file_no, new.payload->>'fileNo', ''),
    'doctorId', coalesce(new.doctor_id, new.payload->>'doctorId', ''),
    'doctorName', coalesce(new.doctor_name, new.payload->>'doctorName', ''),
    'examType', coalesce(new.exam_type, new.payload->>'examType', ''),
    'status', coalesce(new.status, new.payload->>'status', ''),
    'notes', coalesce(new.notes, new.payload->>'notes', ''),
    'linkedIncomeId', coalesce(new.linked_income_id, new.payload->>'linkedIncomeId', '')
  );

  if new.total is not null then
    new.payload = jsonb_set(new.payload, '{total}', to_jsonb(new.total));
  end if;
  if new.paid is not null then
    new.payload = jsonb_set(new.payload, '{paid}', to_jsonb(new.paid));
  end if;

  new.updated_at = now();
  return new;
end;
$$;

-- Macro construct for creating relational tables
do $$
declare
  tbl text;
  tbls text[] := array[
    'visits_clinic', 'visits_dental', 'visits_operations', 'visits_labs', 'visits_radiology',
    'income', 'expense', 'lab_expenses', 'payroll', 'doctors', 'employees',
    'patient_file_index_clinic', 'patient_file_index_dental', 'patient_file_index',
    'patient_files_clinic', 'patient_files_dental', 'settings', 'categories', 'specialties', 'outbox', 'audit_log'
  ];
begin
  foreach tbl in array tbls loop
    execute format('
      create table if not exists public.%I (
        id text primary key,
        date text,
        month text,
        file_no text,
        patient text,
        phone text,
        doctor_id text,
        doctor_name text,
        exam_type text,
        services jsonb default ''[]''::jsonb,
        total numeric default 0,
        paid numeric default 0,
        payment_method text,
        status text,
        notes text,
        linked_income_id text,
        next_visit_date text,
        payload jsonb not null default ''{}''::jsonb,
        updated_at timestamptz not null default now(),
        created_at timestamptz not null default now()
      );

      create index if not exists %I_date_idx on public.%I(date desc, id desc);
      create index if not exists %I_month_idx on public.%I(month desc, id desc);
      create index if not exists %I_patient_idx on public.%I(patient);
      create index if not exists %I_phone_idx on public.%I(phone);
      create index if not exists %I_file_no_idx on public.%I(file_no);
      create index if not exists %I_doctor_idx on public.%I(doctor_id);
      create index if not exists %I_status_idx on public.%I(status);
      create index if not exists %I_updated_idx on public.%I(updated_at desc);

      alter table public.%I enable row level security;

      drop trigger if exists %I_sync_payload on public.%I;
      create trigger %I_sync_payload
      before insert or update on public.%I
      for each row execute function public.sync_explicit_table_payload();
    ', tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl);
  end loop;
end $$;

-- Enable Realtime on explicit tables
do $$
declare
  tbl text;
  tbls text[] := array[
    'visits_clinic', 'visits_dental', 'visits_operations', 'visits_labs', 'visits_radiology',
    'income', 'expense', 'lab_expenses', 'payroll', 'doctors', 'employees',
    'patient_file_index_clinic', 'patient_file_index_dental', 'settings', 'categories', 'audit_log'
  ];
begin
  foreach tbl in array tbls loop
    if not exists (
      select 1 from pg_publication_tables 
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;
