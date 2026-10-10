-- Mitali Hospital / Supabase schema
-- Apply in Supabase SQL Editor before running the application.
create extension if not exists pgcrypto;

create table if not exists public.data_records (
  collection text not null,
  id text not null,
  payload jsonb not null default '{}'::jsonb,
  date_text text,
  month_text text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (collection, id)
);

create or replace function public.sync_data_records_fields() returns trigger language plpgsql as $$
begin
  if new.date_text is null or new.date_text = '' then
    new.date_text = nullif(new.payload->>'date', '');
  end if;
  if new.month_text is null or new.month_text = '' then
    new.month_text = coalesce(nullif(new.payload->>'month', ''), substring(new.payload->>'date' from 1 for 7));
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists data_records_fields_sync on public.data_records;
create trigger data_records_fields_sync
before insert or update on public.data_records
for each row execute function public.sync_data_records_fields();
create index if not exists data_records_collection_updated_idx on public.data_records(collection, updated_at desc, id desc);
create index if not exists data_records_collection_date_idx on public.data_records(collection, date_text desc, id desc);
create index if not exists data_records_collection_month_idx on public.data_records(collection, month_text desc, id desc);
create index if not exists data_records_payload_gin_idx on public.data_records using gin(payload);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null default '',
  role text not null default 'موظف' check (role in ('مدير','موظف')),
  status text not null default 'نشط' check (status in ('نشط','موقوف')),
  permissions jsonb not null default '{}'::jsonb,
  credential_version integer not null default 1,
  security_version integer not null default 1,
  created_at timestamptz not null default now(),
  last_login timestamptz,
  last_password_change_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists profiles_username_idx on public.profiles(username);

create or replace function public.is_manager() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'مدير' and p.status <> 'موقوف');
$$;
create or replace function public.is_active_user() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.status <> 'موقوف');
$$;
create or replace function public.permission_module(p_collection text) returns text
language sql immutable as $$
  select case p_collection
    when 'visits_clinic' then 'clinic' when 'visits_dental' then 'dental'
    when 'visits_operations' then 'operations' when 'visits_labs' then 'labs'
    when 'visits_radiology' then 'radiology' when 'patient_file_index_clinic' then 'patientFilesClinic'
    when 'patient_file_index_dental' then 'patientFilesDental' when 'audit_log' then 'auditlog'
    when 'lab_expenses' then 'payroll' else p_collection end;
$$;


create or replace function public.sync_data_records_fields() returns trigger language plpgsql as $$
begin
  if new.date_text is null or new.date_text = '' then
    new.date_text = coalesce(nullif(new.payload->>'date', ''), nullif(new.payload->>'lastVisitDate', ''));
  end if;
  if new.month_text is null or new.month_text = '' then
    new.month_text = coalesce(nullif(new.payload->>'month', ''), substring(new.payload->>'date' from 1 for 7), substring(new.payload->>'lastVisitDate' from 1 for 7));
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.has_permission(p_collection text, p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_manager() or (
    public.is_active_user() and (
      (p_action = 'view' and p_collection in ('doctors', 'employees', 'settings', 'categories', 'specialties', 'services', 'pricing'))
      or
      coalesce((select (p.permissions -> public.permission_module(p_collection) ->> p_action)::boolean from public.profiles p where p.id = auth.uid() and p.status <> 'موقوف'), false)
      or
      (p_collection = 'patient_file_index_clinic' and (
        (p_action = 'view' and (coalesce((select (p.permissions -> 'clinic' ->> 'view')::boolean from public.profiles p where p.id = auth.uid() and p.status <> 'موقوف'), false) or coalesce((select (p.permissions -> 'patientFilesClinic' ->> 'view')::boolean from public.profiles p where p.id = auth.uid() and p.status <> 'موقوف'), false))) or
        (p_action in ('add', 'edit') and (coalesce((select (p.permissions -> 'clinic' ->> 'add')::boolean from public.profiles p where p.id = auth.uid() and p.status <> 'موقوف'), false) or coalesce((select (p.permissions -> 'clinic' ->> 'edit')::boolean from public.profiles p where p.id = auth.uid() and p.status <> 'موقوف'), false) or coalesce((select (p.permissions -> 'patientFilesClinic' ->> 'add')::boolean from public.profiles p where p.id = auth.uid() and p.status <> 'موقوف'), false) or coalesce((select (p.permissions -> 'patientFilesClinic' ->> 'edit')::boolean from public.profiles p where p.id = auth.uid() and p.status <> 'موقوف'), false)))
      ))
      or
      (p_collection = 'patient_file_index_dental' and (
        (p_action = 'view' and (coalesce((select (p.permissions -> 'dental' ->> 'view')::boolean from public.profiles p where p.id = auth.uid() and p.status <> 'موقوف'), false) or coalesce((select (p.permissions -> 'patientFilesDental' ->> 'view')::boolean from public.profiles p where p.id = auth.uid() and p.status <> 'موقوف'), false))) or
        (p_action in ('add', 'edit') and (coalesce((select (p.permissions -> 'dental' ->> 'add')::boolean from public.profiles p where p.id = auth.uid() and p.status <> 'موقوف'), false) or coalesce((select (p.permissions -> 'dental' ->> 'edit')::boolean from public.profiles p where p.id = auth.uid() and p.status <> 'موقوف'), false) or coalesce((select (p.permissions -> 'patientFilesDental' ->> 'add')::boolean from public.profiles p where p.id = auth.uid() and p.status <> 'موقوف'), false) or coalesce((select (p.permissions -> 'patientFilesDental' ->> 'edit')::boolean from public.profiles p where p.id = auth.uid() and p.status <> 'موقوف'), false)))
      ))
    )
  );
$$;
alter table public.data_records enable row level security;
alter table public.profiles enable row level security;

drop policy if exists data_records_read_active on public.data_records;
drop policy if exists data_records_insert_active on public.data_records;
drop policy if exists data_records_update_active on public.data_records;
drop policy if exists data_records_delete_active on public.data_records;
create policy data_records_read_active on public.data_records for select using (public.has_permission(collection, 'view'));
create policy data_records_insert_active on public.data_records for insert with check (public.has_permission(collection, 'add'));
create policy data_records_update_active on public.data_records for update using (public.has_permission(collection, 'edit')) with check (public.has_permission(collection, 'edit'));
create policy data_records_delete_active on public.data_records for delete using (public.has_permission(collection, 'delete'));

drop policy if exists profiles_self_or_manager_read on public.profiles;
drop policy if exists profiles_self_metadata_update on public.profiles;
create policy profiles_self_or_manager_read on public.profiles for select using (auth.uid() = id or public.is_manager());
create policy profiles_self_metadata_update on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- Realtime is intentionally enabled only for the generic data table.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'data_records'
  ) then
    alter publication supabase_realtime add table public.data_records;
  end if;
end $$;

-- ربط حساب المدير الأول admin في جدول profiles إذا كان موجودًا في auth.users
insert into public.profiles (id, username, display_name, role, status, permissions)
select id, 'admin', 'مدير النظام', 'مدير', 'نشط', '{}'::jsonb
from auth.users
where email ilike 'u-ywrtaw4@accounts.mitali-hospital.internal'
on conflict (id) do update set
  role = 'مدير',
  status = 'نشط';
