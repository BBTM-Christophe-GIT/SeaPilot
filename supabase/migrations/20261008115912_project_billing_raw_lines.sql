alter table public.project_billing_periods
  add column if not exists include_raw_in_pdf boolean not null default true;

create table public.project_billing_raw_lines (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict,
  project_id bigint not null,
  billing_period_id bigint not null,
  service_date date not null,
  designation text not null,
  unit_amount_ht numeric(14, 2) not null default 0,
  quantity numeric(14, 3) not null default 1,
  service_catalog_id bigint,
  include_in_pdf boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_billing_raw_lines_billing_period_fkey
    foreign key (billing_period_id, company_id, project_id)
    references public.project_billing_periods(id, company_id, project_id)
    on delete cascade,
  constraint project_billing_raw_lines_catalog_fkey
    foreign key (company_id, service_catalog_id)
    references public.project_service_catalog(company_id, id)
    on delete restrict,
  constraint project_billing_raw_lines_designation_check
    check (designation = btrim(designation) and char_length(designation) between 1 and 120),
  constraint project_billing_raw_lines_amounts_check
    check (
      unit_amount_ht >= 0 and unit_amount_ht <> 'NaN'::numeric
      and quantity >= 0 and quantity <> 'NaN'::numeric
    )
);

create index project_billing_raw_lines_period_scope_date_idx
  on public.project_billing_raw_lines (billing_period_id, company_id, project_id, service_date, id);
create index project_billing_raw_lines_project_period_idx
  on public.project_billing_raw_lines (project_id, billing_period_id);
create index project_billing_raw_lines_catalog_idx
  on public.project_billing_raw_lines (company_id, service_catalog_id);
create index project_billing_raw_lines_created_by_idx
  on public.project_billing_raw_lines (created_by);
create index project_billing_raw_lines_updated_by_idx
  on public.project_billing_raw_lines (updated_by);

alter table public.project_billing_raw_lines enable row level security;

create policy project_billing_raw_lines_company_read on public.project_billing_raw_lines
  for select to authenticated
  using (public.user_belongs_to_company(company_id));

create policy project_billing_raw_lines_manager_insert on public.project_billing_raw_lines
  for insert to authenticated
  with check (
    public.user_belongs_to_company(company_id)
    and public.has_company_role(company_id, array['admin', 'direction'])
  );

create policy project_billing_raw_lines_manager_update on public.project_billing_raw_lines
  for update to authenticated
  using (
    public.user_belongs_to_company(company_id)
    and public.has_company_role(company_id, array['admin', 'direction'])
  )
  with check (
    public.user_belongs_to_company(company_id)
    and public.has_company_role(company_id, array['admin', 'direction'])
  );

create policy project_billing_raw_lines_manager_delete on public.project_billing_raw_lines
  for delete to authenticated
  using (
    public.user_belongs_to_company(company_id)
    and public.has_company_role(company_id, array['admin', 'direction'])
  );

revoke all on table public.project_billing_raw_lines from public, anon, authenticated;
revoke all on sequence public.project_billing_raw_lines_id_seq from public, anon, authenticated;
grant select, insert, update, delete on table public.project_billing_raw_lines to authenticated;
grant usage, select on sequence public.project_billing_raw_lines_id_seq to authenticated;
grant select, insert, update, delete on table public.project_billing_raw_lines to service_role;
grant usage, select on sequence public.project_billing_raw_lines_id_seq to service_role;

-- Bit 8 identifies Saisie brute; the original scopes 0..7 keep their references.
alter table public.project_billing_client_references
  drop constraint project_billing_client_references_scope_check;
alter table public.project_billing_client_references
  add constraint project_billing_client_references_scope_check check (scope between 0 and 15);

create or replace function public.projects_save_billing_reference(
  target_project bigint,
  target_scope integer,
  target_reference text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if target_scope is null or target_scope < 0 or target_scope > 15 then
    raise exception 'Invalid billing export scope' using errcode = '22023';
  end if;
  insert into public.project_billing_client_references(project_id, company_id, scope, reference)
  select id, company_id, target_scope, btrim(target_reference)
  from public.projects where id = target_project
  on conflict(project_id, scope) do update
    set reference = excluded.reference, updated_at = now();
end;
$$;

revoke all on function public.projects_save_billing_reference(bigint, integer, text) from public, anon;
grant execute on function public.projects_save_billing_reference(bigint, integer, text) to authenticated;

comment on table public.project_billing_raw_lines is
  'Lignes libres de facturation pour un projet et une période mensuelle, avec sélection facultative dans le catalogue de prestations.';
comment on column public.project_billing_raw_lines.service_catalog_id is
  'Origine facultative du catalogue ; désignation, prix et quantité restent libres, sans synchronisation avec le catalogue.';
comment on column public.project_billing_raw_lines.include_in_pdf is
  'Inclut la ligne dans le total sélectionné et le PDF si la section Saisie brute est également sélectionnée.';
comment on column public.project_billing_periods.include_raw_in_pdf is
  'Inclut la section Saisie brute dans le total sélectionné et le PDF de la période.';
