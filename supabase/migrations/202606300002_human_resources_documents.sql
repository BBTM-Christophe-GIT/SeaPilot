alter table public.people
  add column if not exists role_label text,
  add column if not exists register_label text,
  add column if not exists sex text,
  add column if not exists sailor_number text,
  add column if not exists m365_account text,
  add column if not exists phone text,
  add column if not exists postal_address text,
  add column if not exists birth_date date,
  add column if not exists birth_place text,
  add column if not exists identity_document_number text,
  add column if not exists identity_document_type text,
  add column if not exists contract_type text,
  add column if not exists hired_on date,
  add column if not exists departed_on date,
  add column if not exists departure_reason text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_relationship text,
  add column if not exists emergency_contact_phone text,
  add column if not exists emergency_contact_address text,
  add column if not exists waist_size numeric(6, 2),
  add column if not exists chest_size numeric(6, 2),
  add column if not exists full_height_size numeric(6, 2),
  add column if not exists inseam_size numeric(6, 2),
  add column if not exists hip_size numeric(6, 2),
  add column if not exists weight_kg numeric(6, 2),
  add column if not exists shoe_size numeric(5, 2),
  add column if not exists coverall_size text,
  add column if not exists pants_size text,
  add column if not exists jacket_size text,
  add column if not exists deck_certificate_label text,
  add column if not exists engine_certificate_label text,
  add column if not exists crane_training_on date,
  add column if not exists crane_induction_on date;

create table if not exists public.hr_documents (
  id bigint generated always as identity primary key,
  person_id bigint not null references public.people(id) on delete cascade,
  category_key text not null default 'administrative',
  title text not null,
  status text not null default 'valid',
  issued_on date,
  expires_on date,
  requires_captain_validation boolean not null default false,
  source_label text not null default 'seapilot',
  source_sharepoint_id text,
  file_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'hr_documents_status_check'
      and conrelid = 'public.hr_documents'::regclass
  ) then
    alter table public.hr_documents
      add constraint hr_documents_status_check
      check (status in ('valid', 'renew_due', 'expired', 'missing', 'pending_validation'));
  end if;
end $$;

create index if not exists people_active_function_idx on public.people (active, function_label);
create index if not exists people_role_label_idx on public.people (role_label);
create index if not exists people_sailor_number_idx on public.people (sailor_number);
create index if not exists hr_documents_person_id_idx on public.hr_documents (person_id);
create index if not exists hr_documents_category_key_idx on public.hr_documents (category_key);
create index if not exists hr_documents_status_idx on public.hr_documents (status);
create index if not exists hr_documents_expires_on_idx on public.hr_documents (expires_on);
create index if not exists hr_documents_person_status_idx on public.hr_documents (person_id, status);

grant select, insert, update, delete on public.hr_documents to authenticated;
grant usage on public.hr_documents_id_seq to authenticated;

alter table public.hr_documents enable row level security;

drop policy if exists hr_documents_role_read on public.hr_documents;
create policy hr_documents_role_read on public.hr_documents
  for select to authenticated
  using (
    public.has_any_role(array['admin', 'direction', 'armement'])
    or exists (
      select 1
      from public.people person
      where person.id = hr_documents.person_id
        and person.user_id = (select auth.uid())
    )
    or public.is_captain_for_person(person_id)
  );

drop policy if exists hr_documents_office_write on public.hr_documents;
create policy hr_documents_office_write on public.hr_documents
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement']))
  with check (public.has_any_role(array['admin', 'direction', 'armement']));
