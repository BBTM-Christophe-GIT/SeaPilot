create table if not exists public.project_billing_services (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict,
  project_id bigint not null,
  billing_period_id bigint not null,
  category text not null default 'spread_antipollution',
  unit_amount_ht numeric(14, 2) not null default 0,
  quantity numeric(14, 3) not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_billing_services_billing_period_fkey
    foreign key (billing_period_id, company_id, project_id)
    references public.project_billing_periods(id, company_id, project_id)
    on delete cascade,
  constraint project_billing_services_category_check
    check (category in ('spread_antipollution')),
  constraint project_billing_services_amounts_check
    check (unit_amount_ht >= 0 and quantity >= 0),
  constraint project_billing_services_period_category_key
    unique (billing_period_id, category)
);

create index if not exists project_billing_services_project_period_idx
  on public.project_billing_services (project_id, billing_period_id);
create index if not exists project_billing_services_period_company_project_idx
  on public.project_billing_services (billing_period_id, company_id, project_id);
create index if not exists project_billing_services_company_idx
  on public.project_billing_services (company_id);
create index if not exists project_billing_services_created_by_idx
  on public.project_billing_services (created_by);
create index if not exists project_billing_services_updated_by_idx
  on public.project_billing_services (updated_by);

alter table public.project_billing_services enable row level security;

drop policy if exists project_billing_services_company_read on public.project_billing_services;
create policy project_billing_services_company_read on public.project_billing_services
  for select to authenticated
  using (public.user_belongs_to_company(company_id));

drop policy if exists project_billing_services_manager_write on public.project_billing_services;
drop policy if exists project_billing_services_manager_insert on public.project_billing_services;
create policy project_billing_services_manager_insert on public.project_billing_services
  for insert to authenticated
  with check (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  );

drop policy if exists project_billing_services_manager_update on public.project_billing_services;
create policy project_billing_services_manager_update on public.project_billing_services
  for update to authenticated
  using (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  )
  with check (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  );

drop policy if exists project_billing_services_manager_delete on public.project_billing_services;
create policy project_billing_services_manager_delete on public.project_billing_services
  for delete to authenticated
  using (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  );

revoke all on table public.project_billing_services from anon;
revoke all on table public.project_billing_services from authenticated;
grant select, insert, update, delete on table public.project_billing_services to authenticated;
grant usage, select on sequence public.project_billing_services_id_seq to authenticated;

comment on table public.project_billing_services is
  'Prestations BBTM facturées pour un projet et une période mensuelle.';
