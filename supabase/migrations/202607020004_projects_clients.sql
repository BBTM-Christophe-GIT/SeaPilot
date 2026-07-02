create table if not exists public.clients (
  id bigint generated always as identity primary key,
  name text not null,
  code text,
  email text,
  phone text,
  address text,
  city text,
  country text,
  active boolean not null default true,
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

create table if not exists public.projects (
  id bigint generated always as identity primary key,
  title text not null,
  project_code text,
  client_id bigint references public.clients(id) on delete set null,
  client_sharepoint_item_id text,
  client_name text,
  primary_vessel_id bigint references public.vessels(id) on delete set null,
  primary_vessel_sharepoint_item_id text,
  primary_vessel_name text,
  secondary_vessel_id bigint references public.vessels(id) on delete set null,
  secondary_vessel_sharepoint_item_id text,
  secondary_vessel_name text,
  starts_on date,
  ends_on date,
  status text,
  description text,
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
  updated_at timestamptz not null default now(),
  constraint projects_valid_dates check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index if not exists clients_name_normalized_idx
  on public.clients (public.normalize_import_label(name));

create index if not exists clients_code_normalized_idx
  on public.clients (public.normalize_import_label(code));

create index if not exists clients_active_idx
  on public.clients (active);

create index if not exists clients_sharepoint_item_idx
  on public.clients (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists clients_sharepoint_item_unique_idx
  on public.clients (sharepoint_list_id, sharepoint_item_id);

create index if not exists projects_client_id_idx
  on public.projects (client_id);

create index if not exists projects_client_sharepoint_item_id_idx
  on public.projects (client_sharepoint_item_id);

create index if not exists projects_client_name_normalized_idx
  on public.projects (public.normalize_import_label(client_name));

create index if not exists projects_primary_vessel_id_idx
  on public.projects (primary_vessel_id);

create index if not exists projects_primary_vessel_sharepoint_item_id_idx
  on public.projects (primary_vessel_sharepoint_item_id);

create index if not exists projects_primary_vessel_name_normalized_idx
  on public.projects (public.normalize_import_label(primary_vessel_name));

create index if not exists projects_secondary_vessel_id_idx
  on public.projects (secondary_vessel_id);

create index if not exists projects_secondary_vessel_sharepoint_item_id_idx
  on public.projects (secondary_vessel_sharepoint_item_id);

create index if not exists projects_secondary_vessel_name_normalized_idx
  on public.projects (public.normalize_import_label(secondary_vessel_name));

create index if not exists projects_dates_idx
  on public.projects (starts_on, ends_on);

create index if not exists projects_status_idx
  on public.projects (status);

create index if not exists projects_sharepoint_item_idx
  on public.projects (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists projects_sharepoint_item_unique_idx
  on public.projects (sharepoint_list_id, sharepoint_item_id);

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
  ('list-bbtm-clients', 'Nom client', 'Title', 'Text', 'clients', 'name', true, null),
  ('list-bbtm-clients', 'Code client', 'CodeClient', 'Text', 'clients', 'code', false, 'Aliases: Code, ClientCode.'),
  ('list-bbtm-clients', 'Email', 'Email', 'Text', 'clients', 'email', false, null),
  ('list-bbtm-clients', 'Telephone', 'Telephone', 'Text', 'clients', 'phone', false, null),
  ('list-bbtm-clients', 'Adresse', 'Adresse', 'Text', 'clients', 'address', false, null),
  ('list-bbtm-clients', 'Ville', 'Ville', 'Text', 'clients', 'city', false, null),
  ('list-bbtm-clients', 'Pays', 'Pays', 'Text', 'clients', 'country', false, null),
  ('list-bbtm-clients', 'Actif', 'Actif', 'Boolean', 'clients', 'active', false, null),
  ('list-bbtm-projets', 'Titre', 'Title', 'Text', 'projects', 'title', true, null),
  ('list-bbtm-projets', 'Numero projet', 'NumeroProjet', 'Text', 'projects', 'project_code', false, 'Aliases: CodeProjet, ProjectCode.'),
  ('list-bbtm-projets', 'Client SharePoint ID', 'ClientId', 'Lookup', 'projects', 'client_sharepoint_item_id', false, null),
  ('list-bbtm-projets', 'Client', 'Client', 'Lookup/Text', 'projects', 'client_name', false, null),
  ('list-bbtm-projets', 'Navire principal SharePoint ID', 'NavireId', 'Lookup', 'projects', 'primary_vessel_sharepoint_item_id', false, null),
  ('list-bbtm-projets', 'Navire principal', 'Navire', 'Lookup/Text', 'projects', 'primary_vessel_name', false, null),
  ('list-bbtm-projets', 'Navire secondaire', 'Navire_x0020_2', 'Lookup/Text', 'projects', 'secondary_vessel_name', false, null),
  ('list-bbtm-projets', 'Date debut', 'Dated_x00e9_but', 'DateTime', 'projects', 'starts_on', false, null),
  ('list-bbtm-projets', 'Date fin', 'Datefin', 'DateTime', 'projects', 'ends_on', false, null),
  ('list-bbtm-projets', 'Statut', 'Statut', 'Choice/Text', 'projects', 'status', false, null),
  ('list-bbtm-projets', 'Description', 'Description', 'Note/Text', 'projects', 'description', false, null)
on conflict (source_key, internal_name, target_table, target_column) do update
set field_label = excluded.field_label,
    data_type = excluded.data_type,
    required = excluded.required,
    notes = excluded.notes,
    updated_at = now();

create or replace function public.resolve_sharepoint_project_links()
returns table (
  target_table text,
  resolved_clients integer,
  resolved_vessels integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_project_clients integer := 0;
  resolved_primary_vessels integer := 0;
  resolved_secondary_vessels integer := 0;
begin
  update public.projects project
  set client_id = client.id,
      updated_at = now()
  from public.clients client
  where project.client_id is null
    and (
      (
        project.client_sharepoint_item_id is not null
        and client.sharepoint_item_id = project.client_sharepoint_item_id
      )
      or (
        public.normalize_import_label(project.client_name) is not null
        and (
          public.normalize_import_label(project.client_name) = public.normalize_import_label(client.name)
          or public.normalize_import_label(project.client_name) = public.normalize_import_label(client.code)
        )
      )
    );

  get diagnostics resolved_project_clients = row_count;

  update public.projects project
  set primary_vessel_id = vessel.id,
      updated_at = now()
  from public.vessels vessel
  where project.primary_vessel_id is null
    and (
      (
        project.primary_vessel_sharepoint_item_id is not null
        and vessel.sharepoint_item_id = project.primary_vessel_sharepoint_item_id
      )
      or (
        public.normalize_import_label(project.primary_vessel_name) is not null
        and (
          public.normalize_import_label(project.primary_vessel_name) = public.normalize_import_label(vessel.name)
          or public.normalize_import_label(project.primary_vessel_name) = public.normalize_import_label(vessel.acronym)
        )
      )
    );

  get diagnostics resolved_primary_vessels = row_count;

  update public.projects project
  set secondary_vessel_id = vessel.id,
      updated_at = now()
  from public.vessels vessel
  where project.secondary_vessel_id is null
    and (
      (
        project.secondary_vessel_sharepoint_item_id is not null
        and vessel.sharepoint_item_id = project.secondary_vessel_sharepoint_item_id
      )
      or (
        public.normalize_import_label(project.secondary_vessel_name) is not null
        and (
          public.normalize_import_label(project.secondary_vessel_name) = public.normalize_import_label(vessel.name)
          or public.normalize_import_label(project.secondary_vessel_name) = public.normalize_import_label(vessel.acronym)
        )
      )
    );

  get diagnostics resolved_secondary_vessels = row_count;

  return query
  values ('projects', resolved_project_clients, resolved_primary_vessels + resolved_secondary_vessels);
end;
$$;

revoke all on function public.resolve_sharepoint_project_links() from public;
grant execute on function public.resolve_sharepoint_project_links() to authenticated;

grant select, insert, update, delete on
  public.clients,
  public.projects
to authenticated;

grant usage on
  public.clients_id_seq,
  public.projects_id_seq
to authenticated;

alter table public.clients enable row level security;
alter table public.projects enable row level security;

drop policy if exists clients_role_read on public.clients;
create policy clients_role_read on public.clients
  for select to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement', 'capitaine']));

drop policy if exists clients_office_write on public.clients;
create policy clients_office_write on public.clients
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement']))
  with check (public.has_any_role(array['admin', 'direction', 'armement']));

drop policy if exists projects_role_read on public.projects;
create policy projects_role_read on public.projects
  for select to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement', 'capitaine']));

drop policy if exists projects_office_write on public.projects;
create policy projects_office_write on public.projects
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement']))
  with check (public.has_any_role(array['admin', 'direction', 'armement']));
