-- Mitali Hospital / Supabase schema - Migration 002
-- Data integrity, composite query optimization and trigram search indexes

-- 1. Enable pg_trgm extension for trigram text search
create extension if not exists pg_trgm;

-- 2. Drop superseded single-field date/month indexes to save write/storage overhead
drop index if exists public.data_records_collection_date_idx;
drop index if exists public.data_records_collection_month_idx;

-- 3. Composite indexes for date_text & month_text with updated_at tie-breaker
create index if not exists data_records_coll_date_updated_idx
  on public.data_records (collection, date_text desc nulls last, updated_at desc, id desc);

create index if not exists data_records_coll_month_updated_idx
  on public.data_records (collection, month_text desc nulls last, updated_at desc, id desc);

-- 4. BTree expression indexes on frequent query fields in JSON payload
create index if not exists data_records_patient_btree_idx
  on public.data_records (collection, (payload->>'patient'));

create index if not exists data_records_file_no_btree_idx
  on public.data_records (collection, (payload->>'fileNo'));

create index if not exists data_records_phone_btree_idx
  on public.data_records (collection, (payload->>'phone'));

create index if not exists data_records_doctor_id_btree_idx
  on public.data_records (collection, (payload->>'doctorId'));

create index if not exists data_records_name_btree_idx
  on public.data_records (collection, (payload->>'name'));

create index if not exists data_records_status_btree_idx
  on public.data_records (collection, (payload->>'status'));

-- 5. Trigram GIN indexes for partial Arabic text and phone/fileNo search
create index if not exists data_records_patient_trgm_idx
  on public.data_records using gin ((payload->>'patient') gin_trgm_ops);

create index if not exists data_records_phone_trgm_idx
  on public.data_records using gin ((payload->>'phone') gin_trgm_ops);

create index if not exists data_records_file_no_trgm_idx
  on public.data_records using gin ((payload->>'fileNo') gin_trgm_ops);

create index if not exists data_records_name_trgm_idx
  on public.data_records using gin ((payload->>'name') gin_trgm_ops);

