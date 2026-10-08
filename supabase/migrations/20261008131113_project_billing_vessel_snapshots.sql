alter table public.project_service_catalog
  add column vessel_id bigint,
  add column vessel_name text not null default '';

alter table public.project_billing_raw_lines
  add column vessel_id bigint,
  add column vessel_name text not null default '';

alter table public.project_service_catalog
  add constraint project_service_catalog_vessel_company_fkey
    foreign key (vessel_id, company_id)
    references public.vessels(id, company_id) on delete restrict,
  add constraint project_service_catalog_vessel_name_check
    check (vessel_name = btrim(vessel_name));

alter table public.project_billing_raw_lines
  add constraint project_billing_raw_lines_vessel_company_fkey
    foreign key (vessel_id, company_id)
    references public.vessels(id, company_id) on delete restrict,
  add constraint project_billing_raw_lines_vessel_name_check
    check (vessel_name = btrim(vessel_name));

create index project_service_catalog_vessel_company_idx
  on public.project_service_catalog(vessel_id, company_id) where vessel_id is not null;
create index project_billing_raw_lines_vessel_company_idx
  on public.project_billing_raw_lines(vessel_id, company_id) where vessel_id is not null;

-- A category can be reused for another vessel, while legacy entries without a vessel
-- retain their case-insensitive uniqueness within their company.
drop index public.project_service_catalog_active_category_key;
create unique index project_service_catalog_active_vessel_category_key
  on public.project_service_catalog(company_id, lower(category), coalesce(vessel_id, 0))
  where active;

comment on column public.project_service_catalog.vessel_id is
  'Navire facultatif sélectionné dans la flotte SeaPilot de la même société.';
comment on column public.project_service_catalog.vessel_name is
  'Nom du navire conservé lors de la sauvegarde de la prestation ; les lignes de facturation conservent leur propre copie.';
comment on column public.project_billing_raw_lines.vessel_id is
  'Navire facultatif sélectionné dans la flotte SeaPilot de la même société, indépendamment du catalogue.';
comment on column public.project_billing_raw_lines.vessel_name is
  'Nom du navire figé dans la ligne lors de sa saisie, indépendant des renommages de la flotte et du catalogue.';
