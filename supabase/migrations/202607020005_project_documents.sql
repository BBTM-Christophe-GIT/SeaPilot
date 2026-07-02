create table if not exists public.project_documents (
  id bigint generated always as identity primary key,
  project_id bigint references public.projects(id) on delete set null,
  project_sharepoint_item_id text,
  project_code text,
  project_title text,
  category_key text not null default 'project_document',
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

create table if not exists public.contract_documents (
  id bigint generated always as identity primary key,
  project_id bigint references public.projects(id) on delete set null,
  project_sharepoint_item_id text,
  project_code text,
  project_title text,
  category_key text not null default 'contract_document',
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

create index if not exists project_documents_project_id_idx
  on public.project_documents (project_id);

create index if not exists project_documents_project_sharepoint_item_id_idx
  on public.project_documents (project_sharepoint_item_id);

create index if not exists project_documents_project_code_normalized_idx
  on public.project_documents (public.normalize_import_label(project_code));

create index if not exists project_documents_project_title_normalized_idx
  on public.project_documents (public.normalize_import_label(project_title));

create index if not exists project_documents_category_key_idx
  on public.project_documents (category_key);

create index if not exists project_documents_sharepoint_item_idx
  on public.project_documents (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists project_documents_sharepoint_item_unique_idx
  on public.project_documents (sharepoint_list_id, sharepoint_item_id);

create index if not exists contract_documents_project_id_idx
  on public.contract_documents (project_id);

create index if not exists contract_documents_project_sharepoint_item_id_idx
  on public.contract_documents (project_sharepoint_item_id);

create index if not exists contract_documents_project_code_normalized_idx
  on public.contract_documents (public.normalize_import_label(project_code));

create index if not exists contract_documents_project_title_normalized_idx
  on public.contract_documents (public.normalize_import_label(project_title));

create index if not exists contract_documents_category_key_idx
  on public.contract_documents (category_key);

create index if not exists contract_documents_sharepoint_item_idx
  on public.contract_documents (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists contract_documents_sharepoint_item_unique_idx
  on public.contract_documents (sharepoint_list_id, sharepoint_item_id);

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
  ('library-documents-projets', 'Projet SharePoint ID', 'ProjetId', 'Lookup', 'project_documents', 'project_sharepoint_item_id', false, null),
  ('library-documents-projets', 'Numero projet', 'NumeroProjet', 'Text', 'project_documents', 'project_code', false, null),
  ('library-documents-projets', 'Projet', 'Projet', 'Lookup/Text', 'project_documents', 'project_title', false, null),
  ('library-documents-projets', 'Nom fichier', 'FileLeafRef', 'Text', 'project_documents', 'title', true, null),
  ('library-documents-projets', 'URL fichier', 'EncodedAbsUrl', 'Text/Url', 'project_documents', 'file_url', false, null),
  ('library-documents-projets', 'Chemin fichier', 'FileRef', 'Text', 'project_documents', 'notes', false, null),
  ('library-documents-contractuels', 'Projet SharePoint ID', 'ProjetId', 'Lookup', 'contract_documents', 'project_sharepoint_item_id', false, null),
  ('library-documents-contractuels', 'Numero projet', 'NumeroProjet', 'Text', 'contract_documents', 'project_code', false, null),
  ('library-documents-contractuels', 'Projet', 'Projet', 'Lookup/Text', 'contract_documents', 'project_title', false, null),
  ('library-documents-contractuels', 'Nom fichier', 'FileLeafRef', 'Text', 'contract_documents', 'title', true, null),
  ('library-documents-contractuels', 'URL fichier', 'EncodedAbsUrl', 'Text/Url', 'contract_documents', 'file_url', false, null),
  ('library-documents-contractuels', 'Chemin fichier', 'FileRef', 'Text', 'contract_documents', 'notes', false, null)
on conflict (source_key, internal_name, target_table, target_column) do update
set field_label = excluded.field_label,
    data_type = excluded.data_type,
    required = excluded.required,
    notes = excluded.notes,
    updated_at = now();

create or replace function public.resolve_sharepoint_project_document_links()
returns table (
  target_table text,
  resolved_documents integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_project_documents integer := 0;
  resolved_contract_documents integer := 0;
begin
  update public.project_documents document
  set project_id = project.id,
      updated_at = now()
  from public.projects project
  where document.project_id is null
    and (
      (
        document.project_sharepoint_item_id is not null
        and project.sharepoint_item_id = document.project_sharepoint_item_id
      )
      or (
        public.normalize_import_label(document.project_code) is not null
        and public.normalize_import_label(document.project_code) = public.normalize_import_label(project.project_code)
      )
      or (
        public.normalize_import_label(document.project_title) is not null
        and public.normalize_import_label(document.project_title) = public.normalize_import_label(project.title)
      )
    );

  get diagnostics resolved_project_documents = row_count;

  update public.contract_documents document
  set project_id = project.id,
      updated_at = now()
  from public.projects project
  where document.project_id is null
    and (
      (
        document.project_sharepoint_item_id is not null
        and project.sharepoint_item_id = document.project_sharepoint_item_id
      )
      or (
        public.normalize_import_label(document.project_code) is not null
        and public.normalize_import_label(document.project_code) = public.normalize_import_label(project.project_code)
      )
      or (
        public.normalize_import_label(document.project_title) is not null
        and public.normalize_import_label(document.project_title) = public.normalize_import_label(project.title)
      )
    );

  get diagnostics resolved_contract_documents = row_count;

  return query
  values
    ('project_documents', resolved_project_documents),
    ('contract_documents', resolved_contract_documents);
end;
$$;

revoke all on function public.resolve_sharepoint_project_document_links() from public;
grant execute on function public.resolve_sharepoint_project_document_links() to authenticated;

grant select, insert, update, delete on
  public.project_documents,
  public.contract_documents
to authenticated;

grant usage on
  public.project_documents_id_seq,
  public.contract_documents_id_seq
to authenticated;

alter table public.project_documents enable row level security;
alter table public.contract_documents enable row level security;

drop policy if exists project_documents_role_read on public.project_documents;
create policy project_documents_role_read on public.project_documents
  for select to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement', 'capitaine']));

drop policy if exists project_documents_office_write on public.project_documents;
create policy project_documents_office_write on public.project_documents
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement']))
  with check (public.has_any_role(array['admin', 'direction', 'armement']));

drop policy if exists contract_documents_role_read on public.contract_documents;
create policy contract_documents_role_read on public.contract_documents
  for select to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement', 'capitaine']));

drop policy if exists contract_documents_office_write on public.contract_documents;
create policy contract_documents_office_write on public.contract_documents
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement']))
  with check (public.has_any_role(array['admin', 'direction', 'armement']));
