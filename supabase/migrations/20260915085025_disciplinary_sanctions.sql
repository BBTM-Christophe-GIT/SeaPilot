-- Confidential HR metadata only. Documents remain in the private synchronized Google Drive folder.
insert into public.role_module_permissions(role_key, module_key, is_visible)
select key, 'disciplinary', key in ('admin', 'direction') from public.roles
on conflict (role_key, module_key) do nothing;

alter table public.role_module_permissions add constraint disciplinary_roles_restricted
check (module_key <> 'disciplinary' or not is_visible or role_key in ('admin', 'direction'));

create function public.disciplinary_has_access(target_company_id bigint)
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null and public.user_belongs_to_company(target_company_id)
    and exists (
      select 1 from public.user_roles r join public.role_module_permissions p on p.role_key = r.role_key
      where r.user_id = auth.uid() and r.company_id = target_company_id
        and r.role_key in ('admin','direction') and p.module_key = 'disciplinary' and p.is_visible
    );
$$;
revoke all on function public.disciplinary_has_access(bigint) from public, anon;
grant execute on function public.disciplinary_has_access(bigint) to authenticated;

create table public.disciplinary_cases (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id),
  person_id bigint not null references public.people(id),
  case_date date not null default (now() at time zone 'Europe/Paris')::date,
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) < 100000),
  letter jsonb check (letter is null or (jsonb_typeof(letter) = 'object' and octet_length(letter::text) < 2000000)),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  check (data->>'fault' in ('simple','grave','lourde')),
  check (data->>'sanction' in ('avertissement','blame','mise_a_pied','mutation','retrogradation','licenciement')),
  check (data->>'reason' in ('stupefiants_averes','alcool_avere','impregnation_presumee','ivresse_manifeste','comportement_evocateur'))
);
create index disciplinary_cases_person_date_idx on public.disciplinary_cases(company_id, person_id, case_date desc);
create index disciplinary_cases_created_by_idx on public.disciplinary_cases(created_by);
create index disciplinary_cases_updated_by_idx on public.disciplinary_cases(updated_by);

create table public.disciplinary_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.disciplinary_cases(id),
  file_name text not null check (length(file_name) between 1 and 180),
  drive_path text not null unique check (length(drive_path) between 1 and 500),
  drive_url text not null default '' check (drive_url = '' or drive_url ~ '^https://(drive|docs)\.google\.com/'),
  document_date date not null,
  kind text not null check (kind in ('letter','attachment')),
  letter_snapshot jsonb check (letter_snapshot is null or (jsonb_typeof(letter_snapshot) = 'object' and octet_length(letter_snapshot::text) < 2000000)),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index disciplinary_documents_case_date_idx on public.disciplinary_documents(case_id, document_date desc, created_at desc);
create index disciplinary_documents_created_by_idx on public.disciplinary_documents(created_by);
alter table public.disciplinary_cases enable row level security;
alter table public.disciplinary_documents enable row level security;
revoke all on public.disciplinary_cases, public.disciplinary_documents from anon, authenticated;
grant select, insert, update on public.disciplinary_cases to authenticated;
grant select, insert on public.disciplinary_documents to authenticated;

create policy disciplinary_cases_read on public.disciplinary_cases for select to authenticated
using (public.disciplinary_has_access(company_id));
create policy disciplinary_cases_insert on public.disciplinary_cases for insert to authenticated
with check (public.disciplinary_has_access(company_id) and created_by = auth.uid());
create policy disciplinary_cases_update on public.disciplinary_cases for update to authenticated
using (public.disciplinary_has_access(company_id)) with check (public.disciplinary_has_access(company_id));
create policy disciplinary_documents_read on public.disciplinary_documents for select to authenticated
using (exists (select 1 from public.disciplinary_cases c where c.id = case_id and public.disciplinary_has_access(c.company_id)));
create policy disciplinary_documents_insert on public.disciplinary_documents for insert to authenticated
with check (created_by = auth.uid() and exists (select 1 from public.disciplinary_cases c where c.id = case_id and public.disciplinary_has_access(c.company_id)));

create function public.disciplinary_check_case() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not public.disciplinary_has_access(new.company_id) then raise exception 'Accès refusé au dossier disciplinaire.' using errcode = '42501'; end if;
  if new.data->>'employeeName' is null or new.data->>'fault' is null or new.data->>'sanction' is null or new.data->>'reason' is null then
    raise exception 'Dossier incomplet.' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.people p where p.id = new.person_id and p.company_id = new.company_id
      and p.hired_on <= (now() at time zone 'Europe/Paris')::date
      and (p.departed_on is null or p.departed_on > (now() at time zone 'Europe/Paris')::date)) then
      raise exception 'Le collaborateur doit être en poste dans cette entreprise.' using errcode = '23514';
    end if;
    new.created_by := auth.uid(); new.created_at := now();
  elsif row(new.id,new.company_id,new.person_id,new.created_by,new.created_at,new.case_date)
      is distinct from row(old.id,old.company_id,old.person_id,old.created_by,old.created_at,old.case_date) then
    raise exception 'L’identité et le périmètre du dossier sont immuables.' using errcode = '23514';
  end if;
  new.updated_by := auth.uid(); new.updated_at := clock_timestamp();
  return new;
end $$;
revoke all on function public.disciplinary_check_case() from public, anon, authenticated;
create trigger disciplinary_case_guard before insert or update on public.disciplinary_cases
for each row execute function public.disciplinary_check_case();

comment on table public.disciplinary_cases is 'Private disciplinary drafts: only company Admin/Direction with explicit module permission. Not a general HR document source.';
comment on table public.disciplinary_documents is 'Immutable metadata and original letter snapshots; current files live in restricted Google Drive, never in a public storage bucket.';
