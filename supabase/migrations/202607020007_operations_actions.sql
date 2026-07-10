create table if not exists public.purchase_requests (
  id bigint generated always as identity primary key,
  request_number text,
  title text not null default '',
  requested_on date,
  requester_name text,
  supplier_name text,
  project_id bigint references public.projects(id) on delete set null,
  project_sharepoint_item_id text,
  project_code text,
  project_title text,
  amount_ht numeric(14, 2),
  currency text,
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
  updated_at timestamptz not null default now()
);

create table if not exists public.action_items (
  id bigint generated always as identity primary key,
  project_id bigint references public.projects(id) on delete set null,
  project_sharepoint_item_id text,
  project_code text,
  project_title text,
  vessel_id bigint references public.vessels(id) on delete set null,
  vessel_sharepoint_item_id text,
  vessel_name text,
  category_key text not null default 'action',
  action_type text,
  audit_type text,
  title text not null default '',
  status text,
  priority_label text,
  opened_on date,
  due_on date,
  owner_name text,
  auditor_name text,
  description text,
  corrective_action text,
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

create table if not exists public.action_documents (
  id bigint generated always as identity primary key,
  action_item_id bigint references public.action_items(id) on delete set null,
  action_sharepoint_item_id text,
  action_title text,
  category_key text not null default 'progress_sheet',
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

create index if not exists purchase_requests_project_id_idx
  on public.purchase_requests (project_id);

create index if not exists purchase_requests_project_sharepoint_item_id_idx
  on public.purchase_requests (project_sharepoint_item_id);

create index if not exists purchase_requests_project_code_normalized_idx
  on public.purchase_requests (public.normalize_import_label(project_code));

create index if not exists purchase_requests_project_title_normalized_idx
  on public.purchase_requests (public.normalize_import_label(project_title));

create index if not exists purchase_requests_request_number_idx
  on public.purchase_requests (request_number);

create index if not exists purchase_requests_requested_on_idx
  on public.purchase_requests (requested_on);

create index if not exists purchase_requests_status_idx
  on public.purchase_requests (status);

create index if not exists purchase_requests_sharepoint_item_idx
  on public.purchase_requests (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists purchase_requests_sharepoint_item_unique_idx
  on public.purchase_requests (sharepoint_list_id, sharepoint_item_id);

create index if not exists action_items_project_id_idx
  on public.action_items (project_id);

create index if not exists action_items_project_sharepoint_item_id_idx
  on public.action_items (project_sharepoint_item_id);

create index if not exists action_items_project_code_normalized_idx
  on public.action_items (public.normalize_import_label(project_code));

create index if not exists action_items_project_title_normalized_idx
  on public.action_items (public.normalize_import_label(project_title));

create index if not exists action_items_vessel_id_idx
  on public.action_items (vessel_id);

create index if not exists action_items_vessel_sharepoint_item_id_idx
  on public.action_items (vessel_sharepoint_item_id);

create index if not exists action_items_vessel_name_normalized_idx
  on public.action_items (public.normalize_import_label(vessel_name));

create index if not exists action_items_title_normalized_idx
  on public.action_items (public.normalize_import_label(title));

create index if not exists action_items_category_key_idx
  on public.action_items (category_key);

create index if not exists action_items_due_on_idx
  on public.action_items (due_on);

create index if not exists action_items_status_idx
  on public.action_items (status);

create index if not exists action_items_sharepoint_item_idx
  on public.action_items (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists action_items_sharepoint_item_unique_idx
  on public.action_items (sharepoint_list_id, sharepoint_item_id);

create index if not exists action_documents_action_item_id_idx
  on public.action_documents (action_item_id);

create index if not exists action_documents_action_sharepoint_item_id_idx
  on public.action_documents (action_sharepoint_item_id);

create index if not exists action_documents_action_title_normalized_idx
  on public.action_documents (public.normalize_import_label(action_title));

create index if not exists action_documents_category_key_idx
  on public.action_documents (category_key);

create index if not exists action_documents_sharepoint_item_idx
  on public.action_documents (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists action_documents_sharepoint_item_unique_idx
  on public.action_documents (sharepoint_list_id, sharepoint_item_id);

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
  ('list-demande-achat', 'Numero demande', 'NumeroDemande', 'Text', 'purchase_requests', 'request_number', false, 'Fallback: Title.'),
  ('list-demande-achat', 'Titre', 'Title', 'Text', 'purchase_requests', 'title', true, null),
  ('list-demande-achat', 'Date demande', 'DateDemande', 'DateTime', 'purchase_requests', 'requested_on', false, null),
  ('list-demande-achat', 'Demandeur', 'Demandeur', 'Person/Text', 'purchase_requests', 'requester_name', false, null),
  ('list-demande-achat', 'Fournisseur', 'Fournisseur', 'Text', 'purchase_requests', 'supplier_name', false, null),
  ('list-demande-achat', 'Projet SharePoint ID', 'ProjetId', 'Lookup', 'purchase_requests', 'project_sharepoint_item_id', false, null),
  ('list-demande-achat', 'Numero projet', 'NumeroProjet', 'Text', 'purchase_requests', 'project_code', false, null),
  ('list-demande-achat', 'Projet', 'Projet', 'Lookup/Text', 'purchase_requests', 'project_title', false, null),
  ('list-demande-achat', 'Montant HT', 'MontantHT', 'Number', 'purchase_requests', 'amount_ht', false, null),
  ('list-demande-achat', 'Devise', 'Devise', 'Text', 'purchase_requests', 'currency', false, null),
  ('list-demande-achat', 'Statut', 'Statut', 'Choice/Text', 'purchase_requests', 'status', false, null),
  ('list-demande-achat', 'Objet', 'Objet', 'Note/Text', 'purchase_requests', 'description', false, null),
  ('list-audit', 'Projet SharePoint ID', 'ProjetId', 'Lookup', 'action_items', 'project_sharepoint_item_id', false, null),
  ('list-audit', 'Numero projet', 'NumeroProjet', 'Text', 'action_items', 'project_code', false, null),
  ('list-audit', 'Projet', 'Projet', 'Lookup/Text', 'action_items', 'project_title', false, null),
  ('list-audit', 'Navire SharePoint ID', 'NavireId', 'Lookup', 'action_items', 'vessel_sharepoint_item_id', false, null),
  ('list-audit', 'Navire', 'Navire', 'Lookup/Text', 'action_items', 'vessel_name', false, null),
  ('list-audit', 'Audit / Visite HSE', 'Audit_x002f_VisiteHSE', 'Choice/Text', 'action_items', 'action_type', false, null),
  ('list-audit', 'Type audit', 'TypedAudit', 'Choice/Text', 'action_items', 'audit_type', false, null),
  ('list-audit', 'Titre', 'Title', 'Text', 'action_items', 'title', true, null),
  ('list-audit', 'Statut', 'Statut', 'Choice/Text', 'action_items', 'status', false, null),
  ('list-audit', 'Priorite', 'Priorite', 'Choice/Text', 'action_items', 'priority_label', false, null),
  ('list-audit', 'Date audit', 'DateAudit', 'DateTime', 'action_items', 'opened_on', false, null),
  ('list-audit', 'Echeance', 'Echeance', 'DateTime', 'action_items', 'due_on', false, null),
  ('list-audit', 'Responsable', 'Responsable', 'Person/Text', 'action_items', 'owner_name', false, null),
  ('list-audit', 'Auditeur(s)', 'Auditeur_x0028_s_x0029_', 'Person/Text', 'action_items', 'auditor_name', false, null),
  ('list-audit', 'Description', 'Description', 'Note/Text', 'action_items', 'description', false, null),
  ('list-audit', 'Action corrective', 'ActionCorrective', 'Note/Text', 'action_items', 'corrective_action', false, null),
  ('library-fiche-progres', 'Action SharePoint ID', 'ActionId', 'Lookup', 'action_documents', 'action_sharepoint_item_id', false, null),
  ('library-fiche-progres', 'Action', 'Action', 'Lookup/Text', 'action_documents', 'action_title', false, null),
  ('library-fiche-progres', 'Nom fichier', 'FileLeafRef', 'Text', 'action_documents', 'title', true, null),
  ('library-fiche-progres', 'URL fichier', 'EncodedAbsUrl', 'Text/Url', 'action_documents', 'file_url', false, null),
  ('library-fiche-progres', 'Chemin fichier', 'FileRef', 'Text', 'action_documents', 'notes', false, null)
on conflict (source_key, internal_name, target_table, target_column) do update
set field_label = excluded.field_label,
    data_type = excluded.data_type,
    required = excluded.required,
    notes = excluded.notes,
    updated_at = now();

create or replace function public.resolve_sharepoint_operation_links()
returns table (
  target_table text,
  resolved_projects integer,
  resolved_vessels integer,
  resolved_actions integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  purchase_projects integer := 0;
  action_projects integer := 0;
  action_vessels integer := 0;
  action_documents integer := 0;
begin
  update public.purchase_requests request
  set project_id = project.id,
      updated_at = now()
  from public.projects project
  where request.project_id is null
    and (
      (
        request.project_sharepoint_item_id is not null
        and project.sharepoint_item_id = request.project_sharepoint_item_id
      )
      or (
        public.normalize_import_label(request.project_code) is not null
        and public.normalize_import_label(request.project_code) = public.normalize_import_label(project.project_code)
      )
      or (
        public.normalize_import_label(request.project_title) is not null
        and public.normalize_import_label(request.project_title) = public.normalize_import_label(project.title)
      )
    );

  get diagnostics purchase_projects = row_count;

  update public.action_items action
  set project_id = project.id,
      updated_at = now()
  from public.projects project
  where action.project_id is null
    and (
      (
        action.project_sharepoint_item_id is not null
        and project.sharepoint_item_id = action.project_sharepoint_item_id
      )
      or (
        public.normalize_import_label(action.project_code) is not null
        and public.normalize_import_label(action.project_code) = public.normalize_import_label(project.project_code)
      )
      or (
        public.normalize_import_label(action.project_title) is not null
        and public.normalize_import_label(action.project_title) = public.normalize_import_label(project.title)
      )
    );

  get diagnostics action_projects = row_count;

  update public.action_items action
  set vessel_id = vessel.id,
      updated_at = now()
  from public.vessels vessel
  where action.vessel_id is null
    and (
      (
        action.vessel_sharepoint_item_id is not null
        and vessel.sharepoint_item_id = action.vessel_sharepoint_item_id
      )
      or (
        public.normalize_import_label(action.vessel_name) is not null
        and (
          public.normalize_import_label(action.vessel_name) = public.normalize_import_label(vessel.name)
          or public.normalize_import_label(action.vessel_name) = public.normalize_import_label(vessel.acronym)
        )
      )
    );

  get diagnostics action_vessels = row_count;

  update public.action_documents document
  set action_item_id = action.id,
      updated_at = now()
  from public.action_items action
  where document.action_item_id is null
    and (
      (
        document.action_sharepoint_item_id is not null
        and action.sharepoint_item_id = document.action_sharepoint_item_id
      )
      or (
        public.normalize_import_label(document.action_title) is not null
        and public.normalize_import_label(document.action_title) = public.normalize_import_label(action.title)
      )
    );

  get diagnostics action_documents = row_count;

  return query
  values
    ('purchase_requests', purchase_projects, 0, 0),
    ('action_items', action_projects, action_vessels, 0),
    ('action_documents', 0, 0, action_documents);
end;
$$;

revoke all on function public.resolve_sharepoint_operation_links() from public;
grant execute on function public.resolve_sharepoint_operation_links() to authenticated;

grant select, insert, update, delete on
  public.purchase_requests,
  public.action_items,
  public.action_documents
to authenticated;

grant usage on
  public.purchase_requests_id_seq,
  public.action_items_id_seq,
  public.action_documents_id_seq
to authenticated;

alter table public.purchase_requests enable row level security;
alter table public.action_items enable row level security;
alter table public.action_documents enable row level security;

drop policy if exists purchase_requests_role_read on public.purchase_requests;
create policy purchase_requests_role_read on public.purchase_requests
  for select to authenticated
  using ((select public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin'])));

drop policy if exists purchase_requests_office_write on public.purchase_requests;
create policy purchase_requests_office_write on public.purchase_requests
  for all to authenticated
  using ((select public.has_any_role(array['admin', 'direction', 'armement'])))
  with check ((select public.has_any_role(array['admin', 'direction', 'armement'])));

drop policy if exists action_items_role_read on public.action_items;
create policy action_items_role_read on public.action_items
  for select to authenticated
  using ((select public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin'])));

drop policy if exists action_items_office_write on public.action_items;
create policy action_items_office_write on public.action_items
  for all to authenticated
  using ((select public.has_any_role(array['admin', 'direction', 'armement'])))
  with check ((select public.has_any_role(array['admin', 'direction', 'armement'])));

drop policy if exists action_documents_role_read on public.action_documents;
create policy action_documents_role_read on public.action_documents
  for select to authenticated
  using ((select public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin'])));

drop policy if exists action_documents_office_write on public.action_documents;
create policy action_documents_office_write on public.action_documents
  for all to authenticated
  using ((select public.has_any_role(array['admin', 'direction', 'armement'])))
  with check ((select public.has_any_role(array['admin', 'direction', 'armement'])));
