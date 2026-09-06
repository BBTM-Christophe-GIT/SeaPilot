create table if not exists public.project_service_catalog (
  id bigint generated always as identity primary key,
  company_id bigint not null default public.current_planning_company_id()
    references public.companies(id) on delete restrict,
  category text not null,
  unit_amount_ht numeric(14, 2) not null default 0,
  description_html text not null default '',
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_service_catalog_company_id_id_key unique (company_id, id),
  constraint project_service_catalog_category_check
    check (category = btrim(category) and char_length(category) between 1 and 120),
  constraint project_service_catalog_unit_amount_check check (unit_amount_ht >= 0),
  constraint project_service_catalog_description_length_check check (char_length(description_html) <= 100000)
);

create unique index if not exists project_service_catalog_active_category_key
  on public.project_service_catalog (company_id, lower(category))
  where active;
create index if not exists project_service_catalog_company_active_idx
  on public.project_service_catalog (company_id, active, category);

alter table public.project_service_catalog enable row level security;

drop policy if exists project_service_catalog_company_read on public.project_service_catalog;
create policy project_service_catalog_company_read on public.project_service_catalog
  for select to authenticated
  using (public.user_belongs_to_company(company_id));

drop policy if exists project_service_catalog_manager_insert on public.project_service_catalog;
create policy project_service_catalog_manager_insert on public.project_service_catalog
  for insert to authenticated
  with check (
    public.user_belongs_to_company(company_id)
    and public.has_company_role(company_id, array['admin', 'direction'])
  );

drop policy if exists project_service_catalog_manager_update on public.project_service_catalog;
create policy project_service_catalog_manager_update on public.project_service_catalog
  for update to authenticated
  using (
    public.user_belongs_to_company(company_id)
    and public.has_company_role(company_id, array['admin', 'direction'])
  )
  with check (
    public.user_belongs_to_company(company_id)
    and public.has_company_role(company_id, array['admin', 'direction'])
  );

revoke all on table public.project_service_catalog from anon, authenticated;
grant select, insert, update on table public.project_service_catalog to authenticated;
grant usage, select on sequence public.project_service_catalog_id_seq to authenticated;

alter table public.project_billing_services
  drop constraint if exists project_billing_services_category_check;

alter table public.project_billing_services
  add column if not exists service_catalog_id bigint,
  add column if not exists description_html text not null default '';

alter table public.project_billing_services
  drop constraint if exists project_billing_services_category_length_check;
alter table public.project_billing_services
  add constraint project_billing_services_category_length_check
  check (category = btrim(category) and char_length(category) between 1 and 120);

insert into public.project_service_catalog (company_id, category, unit_amount_ht, description_html)
select
  service.company_id,
  case service.category
    when 'spread_antipollution' then 'Spread Antipollution'
    else service.category
  end,
  max(service.unit_amount_ht),
  ''
from public.project_billing_services service
where not exists (
  select 1
  from public.project_service_catalog catalog
  where catalog.company_id = service.company_id
    and lower(catalog.category) = lower(case service.category when 'spread_antipollution' then 'Spread Antipollution' else service.category end)
    and catalog.active
)
group by service.company_id, service.category;

update public.project_billing_services service
set
  service_catalog_id = catalog.id,
  category = catalog.category,
  description_html = catalog.description_html
from public.project_service_catalog catalog
where catalog.company_id = service.company_id
  and catalog.active
  and lower(catalog.category) = lower(case service.category when 'spread_antipollution' then 'Spread Antipollution' else service.category end);

alter table public.project_billing_services
  drop constraint if exists project_billing_services_catalog_fkey;
alter table public.project_billing_services
  add constraint project_billing_services_catalog_fkey
  foreign key (company_id, service_catalog_id)
  references public.project_service_catalog(company_id, id)
  on delete restrict;

create index if not exists project_billing_services_catalog_idx
  on public.project_billing_services (company_id, service_catalog_id);

comment on table public.project_service_catalog is
  'Catalogue administrable des prestations BBTM proposées dans la facturation des projets.';
comment on column public.project_service_catalog.description_html is
  'Description riche de la prestation, nettoyée côté application avant enregistrement.';
comment on column public.project_billing_services.service_catalog_id is
  'Prestation source du catalogue ; les libellé, description et tarif restent figés sur la ligne facturée.';
