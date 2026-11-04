-- Employment contracts are deliberately isolated from the ordinary HR library:
-- employee ownership, captain scope and configurable HR visibility never grant access.
create table public.hr_employment_contracts (
  id bigint generated always as identity primary key,
  company_id bigint not null default public.current_planning_company_id() references public.companies(id),
  person_id bigint not null,
  contract_type text not null check (contract_type in ('CDI', 'CDD')),
  title text not null check (length(btrim(title)) between 1 and 200),
  file_name text not null check (length(file_name) between 1 and 200 and file_name ~ '\.docx$' and file_name !~ '[/\\]'),
  storage_path text not null unique,
  file_size_bytes bigint not null check (file_size_bytes between 1 and 10485760),
  input_data jsonb not null check (jsonb_typeof(input_data) = 'object' and octet_length(input_data::text) <= 100000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (person_id, company_id) references public.people(id, company_id) on delete restrict,
  check (storage_path ~ '^[0-9]+/people/[0-9]+/[a-f0-9-]{36}\.docx$'
    and split_part(storage_path, '/', 1) = company_id::text
    and split_part(storage_path, '/', 3) = person_id::text)
);
create index hr_employment_contracts_person_idx on public.hr_employment_contracts(company_id, person_id, created_at desc);
create index hr_employment_contracts_creator_idx on public.hr_employment_contracts(created_by);

-- Contract-only RH fields (salary, social-security number and agreement terms)
-- must never be exposed through the general people catalogue.
create table public.hr_employment_contract_details (
  person_id bigint primary key,
  company_id bigint not null default public.current_planning_company_id() references public.companies(id),
  input_data jsonb not null check (jsonb_typeof(input_data) = 'object' and octet_length(input_data::text) <= 100000),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  foreign key (person_id, company_id) references public.people(id, company_id) on delete cascade
);
create index hr_employment_contract_details_company_idx on public.hr_employment_contract_details(company_id, person_id);
create index hr_employment_contract_details_actor_idx on public.hr_employment_contract_details(updated_by);
alter table public.hr_employment_contract_details enable row level security;
revoke all on public.hr_employment_contract_details from public, anon, authenticated;
grant select, insert, update, delete on public.hr_employment_contract_details to authenticated;
create policy hr_employment_contract_details_read on public.hr_employment_contract_details for select to authenticated
using (public.has_company_role(company_id, array['admin', 'direction']));
create policy hr_employment_contract_details_insert on public.hr_employment_contract_details for insert to authenticated
with check (public.has_company_role(company_id, array['admin', 'direction']));
create policy hr_employment_contract_details_update on public.hr_employment_contract_details for update to authenticated
using (public.has_company_role(company_id, array['admin', 'direction']))
with check (public.has_company_role(company_id, array['admin', 'direction']));
create policy hr_employment_contract_details_delete on public.hr_employment_contract_details for delete to authenticated
using (public.has_company_role(company_id, array['admin', 'direction']));

create function public.hr_employment_contract_details_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and row(new.person_id,new.company_id) is distinct from row(old.person_id,old.company_id) then
    raise exception 'Le rattachement des données contractuelles est immuable.' using errcode = '23514';
  end if;
  new.updated_by := auth.uid();
  new.updated_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.hr_employment_contract_details_guard() from public, anon, authenticated;
create trigger hr_employment_contract_details_guard before insert or update on public.hr_employment_contract_details
for each row execute function public.hr_employment_contract_details_guard();

alter table public.hr_employment_contracts enable row level security;
revoke all on public.hr_employment_contracts from public, anon, authenticated;
grant select, insert, delete on public.hr_employment_contracts to authenticated;
grant usage on sequence public.hr_employment_contracts_id_seq to authenticated;

create policy hr_employment_contracts_read on public.hr_employment_contracts for select to authenticated
using (public.has_company_role(company_id, array['admin', 'direction']));
create policy hr_employment_contracts_insert on public.hr_employment_contracts for insert to authenticated
with check (public.has_company_role(company_id, array['admin', 'direction']) and created_by = (select auth.uid()));
create policy hr_employment_contracts_delete on public.hr_employment_contracts for delete to authenticated
using (public.has_company_role(company_id, array['admin', 'direction']));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('hr-employment-contracts', 'hr-employment-contracts', false, 10485760,
  array['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Text comparisons avoid unsafe casts on a caller-controlled Storage path.
create function public.hr_employment_contract_path_allowed(target_path text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null
    and target_path ~ '^[0-9]+/people/[0-9]+/[a-f0-9-]{36}\.docx$'
    and split_part(target_path, '/', 1) = public.current_planning_company_id()::text
    and public.has_company_role(public.current_planning_company_id(), array['admin', 'direction'])
    and exists (select 1 from public.people p
      where p.id::text = split_part(target_path, '/', 3)
        and p.company_id = public.current_planning_company_id());
$$;
revoke all on function public.hr_employment_contract_path_allowed(text) from public, anon;
grant execute on function public.hr_employment_contract_path_allowed(text) to authenticated;

create policy hr_employment_contract_storage_read on storage.objects for select to authenticated
using (bucket_id = 'hr-employment-contracts' and public.hr_employment_contract_path_allowed(name));
create policy hr_employment_contract_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'hr-employment-contracts' and public.hr_employment_contract_path_allowed(name));
create policy hr_employment_contract_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'hr-employment-contracts' and public.hr_employment_contract_path_allowed(name));
-- Even a future broad permissive Storage policy cannot expose this bucket.
create policy hr_employment_contract_storage_guard on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'hr-employment-contracts' or public.hr_employment_contract_path_allowed(name))
with check (bucket_id <> 'hr-employment-contracts' or public.hr_employment_contract_path_allowed(name));
create policy hr_employment_contract_storage_anonymous_guard on storage.objects as restrictive for all to anon
using (bucket_id <> 'hr-employment-contracts')
with check (bucket_id <> 'hr-employment-contracts');

create function public.hr_employment_contract_check_file()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not public.has_company_role(new.company_id, array['admin', 'direction'])
    or new.created_by is distinct from auth.uid() then
    raise exception 'Les contrats sont réservés à Administration et Direction.' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects o
    where o.bucket_id = 'hr-employment-contracts' and o.name = new.storage_path) then
    raise exception 'Le fichier du contrat doit être enregistré avant son classement.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.hr_employment_contract_check_file() from public, anon, authenticated;
create trigger hr_employment_contract_check_file before insert on public.hr_employment_contracts
for each row execute function public.hr_employment_contract_check_file();

comment on table public.hr_employment_contracts is 'Confidential generated CDI/CDD contracts. Only company Admin and Direction; immutable generations, separate from ordinary HR documents.';
