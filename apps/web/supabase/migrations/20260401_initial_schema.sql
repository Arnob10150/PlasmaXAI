create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  specialization text,
  organization_id uuid references public.organizations (id) on delete set null,
  organization_name text,
  role text not null default 'doctor',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  patient_code text not null,
  full_name text,
  date_of_birth date,
  sex text,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  case_code text not null unique,
  patient_id uuid not null references public.patients (id) on delete cascade,
  doctor_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  status text not null default 'new',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz
);

create table if not exists public.case_images (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.cases (id) on delete cascade,
  predicted_class text not null,
  confidence numeric(5,4) not null,
  risk_level text not null,
  model_version text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.explanations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.cases (id) on delete cascade,
  counterfactual_text text,
  clinical_insight_text text,
  top_features_json jsonb not null default '[]'::jsonb,
  heatmap_path text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  storage_path text not null,
  report_type text not null default 'pdf',
  generated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  requested_to uuid references auth.users (id) on delete set null,
  status text not null default 'open',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  case_id uuid references public.cases (id) on delete cascade,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists profiles_organization_id_idx on public.profiles (organization_id);
create index if not exists patients_organization_id_idx on public.patients (organization_id);
create index if not exists patients_created_by_idx on public.patients (created_by);
create unique index if not exists patients_org_code_uidx on public.patients (organization_id, patient_code);
create index if not exists cases_patient_id_idx on public.cases (patient_id);
create index if not exists cases_doctor_id_idx on public.cases (doctor_id);
create index if not exists case_images_case_id_idx on public.case_images (case_id);
create index if not exists reports_case_id_idx on public.reports (case_id);
create index if not exists review_requests_case_id_idx on public.review_requests (case_id);
create index if not exists audit_logs_case_id_idx on public.audit_logs (case_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, specialization, organization_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'specialization',
    new.raw_user_meta_data ->> 'organization_name'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create or replace function public.current_org_id()
returns uuid
language sql
stable
as $$
  select organization_id from public.profiles where id = auth.uid()
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.cases enable row level security;
alter table public.case_images enable row level security;
alter table public.predictions enable row level security;
alter table public.explanations enable row level security;
alter table public.reports enable row level security;
alter table public.review_requests enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists organizations_select_own on public.organizations;
create policy organizations_select_own
  on public.organizations for select
  using (
    id = public.current_org_id() or created_by = auth.uid()
  );

drop policy if exists organizations_insert_self on public.organizations;
create policy organizations_insert_self
  on public.organizations for insert
  with check (created_by = auth.uid());

drop policy if exists profiles_select_same_org on public.profiles;
create policy profiles_select_same_org
  on public.profiles for select
  using (
    id = auth.uid() or organization_id = public.current_org_id()
  );

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
  on public.profiles for insert
  with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists patients_same_org on public.patients;
create policy patients_same_org
  on public.patients for all
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());

drop policy if exists cases_same_org on public.cases;
create policy cases_same_org
  on public.cases for all
  using (
    exists (
      select 1 from public.patients p
      where p.id = patient_id and p.organization_id = public.current_org_id()
    )
  )
  with check (
    exists (
      select 1 from public.patients p
      where p.id = patient_id and p.organization_id = public.current_org_id()
    )
  );

drop policy if exists case_images_same_org on public.case_images;
create policy case_images_same_org
  on public.case_images for all
  using (
    exists (
      select 1 from public.cases c
      join public.patients p on p.id = c.patient_id
      where c.id = case_id and p.organization_id = public.current_org_id()
    )
  )
  with check (
    exists (
      select 1 from public.cases c
      join public.patients p on p.id = c.patient_id
      where c.id = case_id and p.organization_id = public.current_org_id()
    )
  );

drop policy if exists predictions_same_org on public.predictions;
create policy predictions_same_org
  on public.predictions for all
  using (
    exists (
      select 1 from public.cases c
      join public.patients p on p.id = c.patient_id
      where c.id = case_id and p.organization_id = public.current_org_id()
    )
  )
  with check (
    exists (
      select 1 from public.cases c
      join public.patients p on p.id = c.patient_id
      where c.id = case_id and p.organization_id = public.current_org_id()
    )
  );

drop policy if exists explanations_same_org on public.explanations;
create policy explanations_same_org
  on public.explanations for all
  using (
    exists (
      select 1 from public.cases c
      join public.patients p on p.id = c.patient_id
      where c.id = case_id and p.organization_id = public.current_org_id()
    )
  )
  with check (
    exists (
      select 1 from public.cases c
      join public.patients p on p.id = c.patient_id
      where c.id = case_id and p.organization_id = public.current_org_id()
    )
  );

drop policy if exists reports_same_org on public.reports;
create policy reports_same_org
  on public.reports for all
  using (
    exists (
      select 1 from public.cases c
      join public.patients p on p.id = c.patient_id
      where c.id = case_id and p.organization_id = public.current_org_id()
    )
  )
  with check (
    exists (
      select 1 from public.cases c
      join public.patients p on p.id = c.patient_id
      where c.id = case_id and p.organization_id = public.current_org_id()
    )
  );

drop policy if exists review_requests_same_org on public.review_requests;
create policy review_requests_same_org
  on public.review_requests for all
  using (
    exists (
      select 1 from public.cases c
      join public.patients p on p.id = c.patient_id
      where c.id = case_id and p.organization_id = public.current_org_id()
    )
  )
  with check (
    exists (
      select 1 from public.cases c
      join public.patients p on p.id = c.patient_id
      where c.id = case_id and p.organization_id = public.current_org_id()
    )
  );

drop policy if exists audit_logs_same_org on public.audit_logs;
create policy audit_logs_same_org
  on public.audit_logs for all
  using (
    case_id is null
    or exists (
      select 1 from public.cases c
      join public.patients p on p.id = c.patient_id
      where c.id = case_id and p.organization_id = public.current_org_id()
    )
  )
  with check (
    case_id is null
    or exists (
      select 1 from public.cases c
      join public.patients p on p.id = c.patient_id
      where c.id = case_id and p.organization_id = public.current_org_id()
    )
  );
insert into storage.buckets (id, name, public)
values ('plasmaxai-case-images', 'plasmaxai-case-images', false)
on conflict (id) do nothing;

drop policy if exists storage_case_images_select on storage.objects;
create policy storage_case_images_select
  on storage.objects for select
  to authenticated
  using (bucket_id = 'plasmaxai-case-images');

drop policy if exists storage_case_images_insert on storage.objects;
create policy storage_case_images_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'plasmaxai-case-images');

drop policy if exists storage_case_images_update on storage.objects;
create policy storage_case_images_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'plasmaxai-case-images')
  with check (bucket_id = 'plasmaxai-case-images');

drop policy if exists storage_case_images_delete on storage.objects;
create policy storage_case_images_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'plasmaxai-case-images');
insert into storage.buckets (id, name, public)
values ('plasmaxai-reports', 'plasmaxai-reports', false)
on conflict (id) do nothing;

drop policy if exists storage_reports_select on storage.objects;
create policy storage_reports_select
  on storage.objects for select
  to authenticated
  using (bucket_id = 'plasmaxai-reports');

drop policy if exists storage_reports_insert on storage.objects;
create policy storage_reports_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'plasmaxai-reports');

drop policy if exists storage_reports_update on storage.objects;
create policy storage_reports_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'plasmaxai-reports')
  with check (bucket_id = 'plasmaxai-reports');

drop policy if exists storage_reports_delete on storage.objects;
create policy storage_reports_delete
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'plasmaxai-reports');
