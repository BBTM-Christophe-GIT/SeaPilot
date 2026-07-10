create table if not exists public.mgo_prices (
  id bigint generated always as identity primary key,
  price_date date,
  price_ht numeric(12, 4),
  currency text,
  supplier_name text,
  title text,
  notes text,
  source_label text not null default 'sharepoint',
  sharepoint_site_url text,
  sharepoint_list_id text,
  sharepoint_list_title text,
  sharepoint_item_id text,
  sharepoint_unique_id text,
  sharepoint_file_ref text,
  sharepoint_encoded_abs_url text,
  source_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dpr_items (
  id bigint generated always as identity primary key,
  title text not null default '',
  project_id bigint references public.projects(id) on delete set null,
  project_sharepoint_item_id text,
  project_code text,
  project_title text,
  vessel_id bigint references public.vessels(id) on delete set null,
  vessel_sharepoint_item_id text,
  vessel_name text,
  report_date date,
  report_time text,
  description text,
  fuel_consumption_l numeric(12, 3),
  mgo_refueling_m3 numeric(12, 3),
  qhse_note text,
  radio_contact boolean not null default false,
  environment_incident_count numeric(12, 3),
  person_accident_count numeric(12, 3),
  dangerous_situation_count numeric(12, 3),
  source_label text not null default 'sharepoint',
  sharepoint_site_url text,
  sharepoint_list_id text,
  sharepoint_list_title text,
  sharepoint_item_id text,
  sharepoint_unique_id text,
  sharepoint_file_ref text,
  sharepoint_encoded_abs_url text,
  source_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dpr_archives (
  id bigint generated always as identity primary key,
  dpr_item_id bigint references public.dpr_items(id) on delete set null,
  dpr_sharepoint_item_id text,
  project_id bigint references public.projects(id) on delete set null,
  project_sharepoint_item_id text,
  project_code text,
  project_title text,
  report_date date,
  title text not null,
  source_label text not null default 'sharepoint',
  source_sharepoint_id text,
  file_url text,
  notes text,
  sharepoint_site_url text,
  sharepoint_list_id text,
  sharepoint_list_title text,
  sharepoint_item_id text,
  sharepoint_unique_id text,
  sharepoint_file_ref text,
  sharepoint_encoded_abs_url text,
  source_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mgo_prices_price_date_idx
  on public.mgo_prices (price_date);

create index if not exists mgo_prices_sharepoint_item_idx
  on public.mgo_prices (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists mgo_prices_sharepoint_item_unique_idx
  on public.mgo_prices (sharepoint_list_id, sharepoint_item_id);

create index if not exists dpr_items_project_id_idx
  on public.dpr_items (project_id);

create index if not exists dpr_items_project_sharepoint_item_id_idx
  on public.dpr_items (project_sharepoint_item_id);

create index if not exists dpr_items_project_code_normalized_idx
  on public.dpr_items (public.normalize_import_label(project_code));

create index if not exists dpr_items_project_title_normalized_idx
  on public.dpr_items (public.normalize_import_label(project_title));

create index if not exists dpr_items_vessel_id_idx
  on public.dpr_items (vessel_id);

create index if not exists dpr_items_vessel_sharepoint_item_id_idx
  on public.dpr_items (vessel_sharepoint_item_id);

create index if not exists dpr_items_vessel_name_normalized_idx
  on public.dpr_items (public.normalize_import_label(vessel_name));

create index if not exists dpr_items_report_date_idx
  on public.dpr_items (report_date);

create index if not exists dpr_items_sharepoint_item_idx
  on public.dpr_items (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists dpr_items_sharepoint_item_unique_idx
  on public.dpr_items (sharepoint_list_id, sharepoint_item_id);

create index if not exists dpr_archives_dpr_item_id_idx
  on public.dpr_archives (dpr_item_id);

create index if not exists dpr_archives_dpr_sharepoint_item_id_idx
  on public.dpr_archives (dpr_sharepoint_item_id);

create index if not exists dpr_archives_project_id_idx
  on public.dpr_archives (project_id);

create index if not exists dpr_archives_project_sharepoint_item_id_idx
  on public.dpr_archives (project_sharepoint_item_id);

create index if not exists dpr_archives_project_code_normalized_idx
  on public.dpr_archives (public.normalize_import_label(project_code));

create index if not exists dpr_archives_project_title_normalized_idx
  on public.dpr_archives (public.normalize_import_label(project_title));

create index if not exists dpr_archives_report_date_idx
  on public.dpr_archives (report_date);

create index if not exists dpr_archives_sharepoint_item_idx
  on public.dpr_archives (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists dpr_archives_sharepoint_item_unique_idx
  on public.dpr_archives (sharepoint_list_id, sharepoint_item_id);

insert into public.sharepoint_field_mappings (
  source_key,
  field_label,
  internal_name,
  data_type,
  target_table,
  target_column,
  required,
  notes
)
values
  ('list-mgo', 'Date prix', 'Date', 'DateTime', 'mgo_prices', 'price_date', false, null),
  ('list-mgo', 'Prix MGO - HT', 'PrixMGO_x002d_HT', 'Number', 'mgo_prices', 'price_ht', false, null),
  ('list-mgo', 'Devise', 'Devise', 'Text', 'mgo_prices', 'currency', false, null),
  ('list-mgo', 'Fournisseur', 'Fournisseur', 'Text', 'mgo_prices', 'supplier_name', false, null),
  ('list-mgo', 'Titre', 'Title', 'Text', 'mgo_prices', 'title', false, null),
  ('list-indicateurs-projet-p144emdt', 'Titre', 'Title', 'Text', 'dpr_items', 'title', false, null),
  ('list-indicateurs-projet-p144emdt', 'Projet SharePoint ID', 'DPR_x002d_ProjetId', 'Lookup', 'dpr_items', 'project_sharepoint_item_id', false, null),
  ('list-indicateurs-projet-p144emdt', 'Projet', 'DPR_x002d_Projet', 'Lookup/Text', 'dpr_items', 'project_title', false, null),
  ('list-indicateurs-projet-p144emdt', 'Navire SharePoint ID', 'DPR_x002d_NavireId', 'Lookup', 'dpr_items', 'vessel_sharepoint_item_id', false, null),
  ('list-indicateurs-projet-p144emdt', 'Navire', 'DPR_x002d_Navire', 'Lookup/Text', 'dpr_items', 'vessel_name', false, null),
  ('list-indicateurs-projet-p144emdt', 'Date DPR', 'DPR_x002d_Date', 'DateTime', 'dpr_items', 'report_date', false, null),
  ('list-indicateurs-projet-p144emdt', 'Heure du DPR', 'Heure_x0020_du_x0020_DPR', 'Text', 'dpr_items', 'report_time', false, null),
  ('list-indicateurs-projet-p144emdt', 'Description journee', 'DPR_x002d_DescriptionJourn_x00e9', 'Note/Text', 'dpr_items', 'description', false, null),
  ('list-indicateurs-projet-p144emdt', 'Consommation carburant', 'DPR_x002d_ConsommationdeCarburan', 'Number', 'dpr_items', 'fuel_consumption_l', false, null),
  ('list-indicateurs-projet-p144emdt', 'Avitaillement MGO', 'DPR_x002d_AvitaillementMGO_x0028', 'Number', 'dpr_items', 'mgo_refueling_m3', false, null),
  ('list-indicateurs-projet-p144emdt', 'Note QHSE', 'DPR_x002d_NoteQHSE', 'Text', 'dpr_items', 'qhse_note', false, null),
  ('library-dpr', 'DPR SharePoint ID', 'DPRId', 'Lookup', 'dpr_archives', 'dpr_sharepoint_item_id', false, null),
  ('library-dpr', 'Projet SharePoint ID', 'ProjetId', 'Lookup', 'dpr_archives', 'project_sharepoint_item_id', false, null),
  ('library-dpr', 'Numero projet', 'NumeroProjet', 'Text', 'dpr_archives', 'project_code', false, null),
  ('library-dpr', 'Projet', 'Projet', 'Lookup/Text', 'dpr_archives', 'project_title', false, null),
  ('library-dpr', 'Date DPR', 'DateduDPR', 'DateTime', 'dpr_archives', 'report_date', false, null),
  ('library-dpr', 'Nom fichier', 'FileLeafRef', 'Text', 'dpr_archives', 'title', true, null),
  ('library-dpr', 'URL fichier', 'EncodedAbsUrl', 'Text/Url', 'dpr_archives', 'file_url', false, null),
  ('library-dpr', 'Chemin fichier', 'FileRef', 'Text', 'dpr_archives', 'notes', false, null)
on conflict (source_key, internal_name, target_table, target_column) do update
set field_label = excluded.field_label,
    data_type = excluded.data_type,
    required = excluded.required,
    notes = excluded.notes,
    updated_at = now();

create or replace function public.resolve_sharepoint_dpr_links()
returns table (
  target_table text,
  resolved_projects integer,
  resolved_vessels integer,
  resolved_dpr_items integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  dpr_item_projects integer := 0;
  dpr_item_vessels integer := 0;
  dpr_archive_projects integer := 0;
  dpr_archive_items integer := 0;
begin
  update public.dpr_items item
  set project_id = project.id,
      updated_at = now()
  from public.projects project
  where item.project_id is null
    and (
      (
        item.project_sharepoint_item_id is not null
        and project.sharepoint_item_id = item.project_sharepoint_item_id
      )
      or (
        public.normalize_import_label(item.project_code) is not null
        and public.normalize_import_label(item.project_code) = public.normalize_import_label(project.project_code)
      )
      or (
        public.normalize_import_label(item.project_title) is not null
        and public.normalize_import_label(item.project_title) = public.normalize_import_label(project.title)
      )
    );

  get diagnostics dpr_item_projects = row_count;

  update public.dpr_items item
  set vessel_id = vessel.id,
      updated_at = now()
  from public.vessels vessel
  where item.vessel_id is null
    and (
      (
        item.vessel_sharepoint_item_id is not null
        and vessel.sharepoint_item_id = item.vessel_sharepoint_item_id
      )
      or (
        public.normalize_import_label(item.vessel_name) is not null
        and (
          public.normalize_import_label(item.vessel_name) = public.normalize_import_label(vessel.name)
          or public.normalize_import_label(item.vessel_name) = public.normalize_import_label(vessel.acronym)
        )
      )
    );

  get diagnostics dpr_item_vessels = row_count;

  update public.dpr_archives archive
  set project_id = project.id,
      updated_at = now()
  from public.projects project
  where archive.project_id is null
    and (
      (
        archive.project_sharepoint_item_id is not null
        and project.sharepoint_item_id = archive.project_sharepoint_item_id
      )
      or (
        public.normalize_import_label(archive.project_code) is not null
        and public.normalize_import_label(archive.project_code) = public.normalize_import_label(project.project_code)
      )
      or (
        public.normalize_import_label(archive.project_title) is not null
        and public.normalize_import_label(archive.project_title) = public.normalize_import_label(project.title)
      )
    );

  get diagnostics dpr_archive_projects = row_count;

  update public.dpr_archives archive
  set dpr_item_id = item.id,
      updated_at = now()
  from public.dpr_items item
  where archive.dpr_item_id is null
    and (
      (
        archive.dpr_sharepoint_item_id is not null
        and item.sharepoint_item_id = archive.dpr_sharepoint_item_id
      )
      or (
        archive.report_date is not null
        and item.report_date = archive.report_date
        and (
          archive.project_id = item.project_id
          or (
            public.normalize_import_label(archive.project_code) is not null
            and public.normalize_import_label(archive.project_code) = public.normalize_import_label(item.project_code)
          )
        )
      )
    );

  get diagnostics dpr_archive_items = row_count;

  return query
  values
    ('dpr_items', dpr_item_projects, dpr_item_vessels, 0),
    ('dpr_archives', dpr_archive_projects, 0, dpr_archive_items);
end;
$$;

revoke all on function public.resolve_sharepoint_dpr_links() from public;
grant execute on function public.resolve_sharepoint_dpr_links() to authenticated;

grant select, insert, update, delete on
  public.mgo_prices,
  public.dpr_items,
  public.dpr_archives
to authenticated;

grant usage on
  public.mgo_prices_id_seq,
  public.dpr_items_id_seq,
  public.dpr_archives_id_seq
to authenticated;

alter table public.mgo_prices enable row level security;
alter table public.dpr_items enable row level security;
alter table public.dpr_archives enable row level security;

drop policy if exists mgo_prices_role_read on public.mgo_prices;
create policy mgo_prices_role_read on public.mgo_prices
  for select to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']));

drop policy if exists mgo_prices_office_write on public.mgo_prices;
create policy mgo_prices_office_write on public.mgo_prices
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement']))
  with check (public.has_any_role(array['admin', 'direction', 'armement']));

drop policy if exists dpr_items_role_read on public.dpr_items;
create policy dpr_items_role_read on public.dpr_items
  for select to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']));

drop policy if exists dpr_items_office_write on public.dpr_items;
create policy dpr_items_office_write on public.dpr_items
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement']))
  with check (public.has_any_role(array['admin', 'direction', 'armement']));

drop policy if exists dpr_archives_role_read on public.dpr_archives;
create policy dpr_archives_role_read on public.dpr_archives
  for select to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']));

drop policy if exists dpr_archives_office_write on public.dpr_archives;
create policy dpr_archives_office_write on public.dpr_archives
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement']))
  with check (public.has_any_role(array['admin', 'direction', 'armement']));
