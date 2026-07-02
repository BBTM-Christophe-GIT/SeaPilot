create table if not exists public.procedures (
  id bigint generated always as identity primary key,
  procedure_code text,
  title text not null,
  status text not null default 'unknown',
  revision_label text,
  published_on date,
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
  updated_at timestamptz not null default now(),
  constraint procedures_status_check
    check (status in ('draft', 'review', 'approved', 'archived', 'unknown'))
);

create table if not exists public.published_procedures (
  id bigint generated always as identity primary key,
  procedure_id bigint references public.procedures(id) on delete set null,
  procedure_sharepoint_item_id text,
  procedure_code text,
  title text not null,
  status text not null default 'unknown',
  revision_label text,
  published_on date,
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
  updated_at timestamptz not null default now(),
  constraint published_procedures_status_check
    check (status in ('draft', 'review', 'approved', 'archived', 'unknown'))
);

create index if not exists procedures_procedure_code_idx
  on public.procedures (procedure_code);

create index if not exists procedures_procedure_code_normalized_idx
  on public.procedures (public.normalize_import_label(procedure_code));

create index if not exists procedures_status_idx
  on public.procedures (status);

create index if not exists procedures_sharepoint_item_idx
  on public.procedures (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists procedures_sharepoint_item_unique_idx
  on public.procedures (sharepoint_list_id, sharepoint_item_id);

create index if not exists published_procedures_procedure_id_idx
  on public.published_procedures (procedure_id);

create index if not exists published_procedures_procedure_sharepoint_item_id_idx
  on public.published_procedures (procedure_sharepoint_item_id);

create index if not exists published_procedures_procedure_code_idx
  on public.published_procedures (procedure_code);

create index if not exists published_procedures_procedure_code_normalized_idx
  on public.published_procedures (public.normalize_import_label(procedure_code));

create index if not exists published_procedures_status_idx
  on public.published_procedures (status);

create index if not exists published_procedures_sharepoint_item_idx
  on public.published_procedures (sharepoint_list_id, sharepoint_item_id);

create unique index if not exists published_procedures_sharepoint_item_unique_idx
  on public.published_procedures (sharepoint_list_id, sharepoint_item_id);

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
  ('library-qsms', 'Code procedure', 'Code', 'Text', 'procedures', 'procedure_code', false, 'Also inferred from FileLeafRef when missing.'),
  ('library-qsms', 'Nom fichier', 'FileLeafRef', 'Text', 'procedures', 'title', true, null),
  ('library-qsms', 'Revision', 'Revision', 'Text', 'procedures', 'revision_label', false, 'Aliases: Version, Indice.'),
  ('library-qsms', 'Statut', 'Statut', 'Choice/Text', 'procedures', 'status', false, null),
  ('library-qsms', 'Date publication', 'DatePublication', 'DateTime', 'procedures', 'published_on', false, null),
  ('library-qsms', 'URL fichier', 'EncodedAbsUrl', 'Text/Url', 'procedures', 'file_url', false, null),
  ('library-qsms', 'Chemin fichier', 'FileRef', 'Text', 'procedures', 'notes', false, null),
  ('library-qsms-pdf', 'Procedure source SharePoint ID', 'ProcedureId', 'Lookup', 'published_procedures', 'procedure_sharepoint_item_id', false, null),
  ('library-qsms-pdf', 'Code procedure', 'Code', 'Text', 'published_procedures', 'procedure_code', false, 'Also inferred from FileLeafRef when missing.'),
  ('library-qsms-pdf', 'Nom fichier', 'FileLeafRef', 'Text', 'published_procedures', 'title', true, null),
  ('library-qsms-pdf', 'Revision', 'Revision', 'Text', 'published_procedures', 'revision_label', false, 'Aliases: Version, Indice.'),
  ('library-qsms-pdf', 'Statut', 'Statut', 'Choice/Text', 'published_procedures', 'status', false, null),
  ('library-qsms-pdf', 'Date publication', 'DatePublication', 'DateTime', 'published_procedures', 'published_on', false, null),
  ('library-qsms-pdf', 'URL fichier', 'EncodedAbsUrl', 'Text/Url', 'published_procedures', 'file_url', false, null),
  ('library-qsms-pdf', 'Chemin fichier', 'FileRef', 'Text', 'published_procedures', 'notes', false, null)
on conflict (source_key, internal_name, target_table, target_column) do update
set field_label = excluded.field_label,
    data_type = excluded.data_type,
    required = excluded.required,
    notes = excluded.notes,
    updated_at = now();

create or replace function public.resolve_sharepoint_published_procedure_links()
returns table (
  target_table text,
  resolved_publications integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_count integer := 0;
begin
  update public.published_procedures publication
  set procedure_id = source_procedure.id,
      updated_at = now()
  from public.procedures source_procedure
  where publication.procedure_id is null
    and (
      (
        publication.procedure_sharepoint_item_id is not null
        and source_procedure.sharepoint_item_id = publication.procedure_sharepoint_item_id
      )
      or (
        public.normalize_import_label(publication.procedure_code) is not null
        and public.normalize_import_label(publication.procedure_code) =
          public.normalize_import_label(source_procedure.procedure_code)
      )
    );

  get diagnostics resolved_count = row_count;

  return query
  values ('published_procedures', resolved_count);
end;
$$;

revoke all on function public.resolve_sharepoint_published_procedure_links() from public;
grant execute on function public.resolve_sharepoint_published_procedure_links() to authenticated;

grant select, insert, update, delete on
  public.procedures,
  public.published_procedures
to authenticated;

grant usage on
  public.procedures_id_seq,
  public.published_procedures_id_seq
to authenticated;

alter table public.procedures enable row level security;
alter table public.published_procedures enable row level security;

drop policy if exists procedures_role_read on public.procedures;
create policy procedures_role_read on public.procedures
  for select to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']));

drop policy if exists procedures_office_write on public.procedures;
create policy procedures_office_write on public.procedures
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement']))
  with check (public.has_any_role(array['admin', 'direction', 'armement']));

drop policy if exists published_procedures_role_read on public.published_procedures;
create policy published_procedures_role_read on public.published_procedures
  for select to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']));

drop policy if exists published_procedures_office_write on public.published_procedures;
create policy published_procedures_office_write on public.published_procedures
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement']))
  with check (public.has_any_role(array['admin', 'direction', 'armement']));
