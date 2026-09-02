-- QSMS procedures: keep editable source files private to Administration and
-- Direction, while exposing only explicitly published PDFs to operational
-- profiles. Historical SharePoint URLs remain readable during migration.

alter table public.procedures
  add column if not exists category_label text,
  add column if not exists diffusion_on date,
  add column if not exists description text,
  add column if not exists regulatory_requirement text,
  add column if not exists ism_chapter text,
  add column if not exists vessel_name text,
  add column if not exists project_name text,
  add column if not exists document_number text,
  add column if not exists restrictions text,
  add column if not exists annual_review boolean not null default false,
  add column if not exists approval_status text,
  add column if not exists theme text,
  add column if not exists document_type text,
  add column if not exists bridge_watch boolean not null default false,
  add column if not exists version_label text,
  add column if not exists source_storage_bucket text,
  add column if not exists source_storage_path text,
  add column if not exists source_file_name text,
  add column if not exists source_mime_type text,
  add column if not exists source_size_bytes bigint,
  add column if not exists modified_by uuid;

alter table public.published_procedures
  add column if not exists category_label text,
  add column if not exists diffusion_on date,
  add column if not exists description text,
  add column if not exists regulatory_requirement text,
  add column if not exists ism_chapter text,
  add column if not exists vessel_name text,
  add column if not exists project_name text,
  add column if not exists document_number text,
  add column if not exists restrictions text,
  add column if not exists annual_review boolean not null default false,
  add column if not exists approval_status text,
  add column if not exists theme text,
  add column if not exists document_type text,
  add column if not exists bridge_watch boolean not null default false,
  add column if not exists version_label text,
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists published_by uuid;

alter table public.procedures
  alter column modified_by set default auth.uid();

alter table public.published_procedures
  alter column published_by set default auth.uid();

update public.procedures
set document_number = coalesce(document_number, procedure_code),
    version_label = coalesce(version_label, revision_label),
    approval_status = coalesce(
      approval_status,
      case status
        when 'approved' then 'Document approuve'
        when 'draft' then 'En cours de creation'
        when 'review' then 'En cours de validation'
        when 'archived' then 'Archive'
        else null
      end
    )
where document_number is null
   or version_label is null
   or approval_status is null;

update public.published_procedures publication
set document_number = coalesce(publication.document_number, publication.procedure_code),
    version_label = coalesce(publication.version_label, publication.revision_label),
    approval_status = coalesce(publication.approval_status, 'Document approuve'),
    ism_chapter = coalesce(publication.ism_chapter, source.ism_chapter),
    vessel_name = coalesce(publication.vessel_name, source.vessel_name),
    project_name = coalesce(publication.project_name, source.project_name),
    theme = coalesce(publication.theme, source.theme),
    document_type = coalesce(publication.document_type, source.document_type)
from public.procedures source
where publication.procedure_id = source.id;

alter table public.procedures
  drop constraint if exists procedures_source_storage_check;

alter table public.procedures
  add constraint procedures_source_storage_check check (
    (
      source_storage_bucket is null
      and source_storage_path is null
      and source_file_name is null
      and source_mime_type is null
      and source_size_bytes is null
    )
    or (
      source_storage_bucket = 'procedure-documents'
      and source_storage_path like 'sources/%'
      and nullif(btrim(source_file_name), '') is not null
      and nullif(btrim(source_mime_type), '') is not null
      and source_size_bytes > 0
    )
  );

alter table public.published_procedures
  drop constraint if exists published_procedures_storage_check;

alter table public.published_procedures
  add constraint published_procedures_storage_check check (
    (
      storage_bucket is null
      and storage_path is null
      and file_name is null
      and mime_type is null
      and size_bytes is null
    )
    or (
      storage_bucket = 'procedure-documents'
      and storage_path like 'published/%'
      and lower(file_name) like '%.pdf'
      and mime_type = 'application/pdf'
      and size_bytes > 0
    )
  );

alter table public.published_procedures
  drop constraint if exists published_procedures_procedure_id_fkey;

alter table public.published_procedures
  add constraint published_procedures_procedure_id_fkey
  foreign key (procedure_id) references public.procedures(id) on delete cascade;

create index if not exists procedures_ism_chapter_idx
  on public.procedures (ism_chapter, procedure_code);

create index if not exists procedures_project_name_idx
  on public.procedures (project_name);

create index if not exists procedures_vessel_name_idx
  on public.procedures (vessel_name);

create unique index if not exists procedures_source_storage_object_key
  on public.procedures (source_storage_bucket, source_storage_path)
  where source_storage_bucket is not null and source_storage_path is not null;

create index if not exists published_procedures_ism_chapter_idx
  on public.published_procedures (ism_chapter, procedure_code);

create unique index if not exists published_procedures_storage_object_key
  on public.published_procedures (storage_bucket, storage_path)
  where storage_bucket is not null and storage_path is not null;

insert into public.sharepoint_field_mappings (
  source_key, field_label, internal_name, data_type, target_table, target_column, required, notes
)
values
  ('library-qsms', 'Catégorie', 'Catégorie', 'Choice/Text', 'procedures', 'category_label', false, null),
  ('library-qsms', 'Date diffusion', 'Date diffusion', 'DateTime', 'procedures', 'diffusion_on', false, null),
  ('library-qsms', 'Description', 'Description', 'Note/Text', 'procedures', 'description', false, null),
  ('library-qsms', 'Exigence Réglementaire', 'Exigence Réglementaire', 'Note/Text', 'procedures', 'regulatory_requirement', false, null),
  ('library-qsms', 'ISM Chapitre', 'ISM Chapitre', 'Choice/Text', 'procedures', 'ism_chapter', false, null),
  ('library-qsms', 'Navire', 'Navire', 'Lookup/Text', 'procedures', 'vessel_name', false, null),
  ('library-qsms', 'Projet', 'Projet', 'Lookup/Text', 'procedures', 'project_name', false, null),
  ('library-qsms', 'Numéro', 'Numéro', 'Text', 'procedures', 'document_number', false, null),
  ('library-qsms', 'Restrictions', 'Restrictions', 'Note/Text', 'procedures', 'restrictions', false, null),
  ('library-qsms', 'Revue annuelle', 'Revue annuelle', 'Boolean', 'procedures', 'annual_review', false, null),
  ('library-qsms', 'Statut approbation', 'Statut approbation', 'Choice/Text', 'procedures', 'approval_status', false, null),
  ('library-qsms', 'Thème', 'Thème', 'Choice/Text', 'procedures', 'theme', false, null),
  ('library-qsms', 'Type document', 'Type document', 'Choice/Text', 'procedures', 'document_type', false, null),
  ('library-qsms', 'Veille Passerelle', 'Veille Passerelle', 'Boolean', 'procedures', 'bridge_watch', false, null),
  ('library-qsms', 'Version', 'Version', 'Text', 'procedures', 'version_label', false, null),
  ('library-qsms-pdf', 'ISM Chapitre', 'ISM Chapitre', 'Choice/Text', 'published_procedures', 'ism_chapter', false, null),
  ('library-qsms-pdf', 'Navire', 'Navire', 'Lookup/Text', 'published_procedures', 'vessel_name', false, null),
  ('library-qsms-pdf', 'Projet', 'Projet', 'Lookup/Text', 'published_procedures', 'project_name', false, null),
  ('library-qsms-pdf', 'Numéro', 'Numéro', 'Text', 'published_procedures', 'document_number', false, null),
  ('library-qsms-pdf', 'Thème', 'Thème', 'Choice/Text', 'published_procedures', 'theme', false, null),
  ('library-qsms-pdf', 'Type document', 'Type document', 'Choice/Text', 'published_procedures', 'document_type', false, null),
  ('library-qsms-pdf', 'Version', 'Version', 'Text', 'published_procedures', 'version_label', false, null)
on conflict (source_key, internal_name, target_table, target_column) do update
set field_label = excluded.field_label,
    data_type = excluded.data_type,
    required = excluded.required,
    notes = excluded.notes,
    updated_at = now();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'procedure-documents',
  'procedure-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'text/plain'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists procedures_role_read on public.procedures;
drop policy if exists procedures_office_write on public.procedures;
drop policy if exists procedures_administration_read on public.procedures;
drop policy if exists procedures_administration_write on public.procedures;

create policy procedures_administration_read on public.procedures
  for select to authenticated
  using (public.has_any_role(array['admin', 'direction']));

create policy procedures_administration_write on public.procedures
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction']))
  with check (public.has_any_role(array['admin', 'direction']));

drop policy if exists published_procedures_role_read on public.published_procedures;
drop policy if exists published_procedures_office_write on public.published_procedures;
drop policy if exists published_procedures_administration_write on public.published_procedures;

create policy published_procedures_role_read on public.published_procedures
  for select to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']));

create policy published_procedures_administration_write on public.published_procedures
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction']))
  with check (public.has_any_role(array['admin', 'direction']));

drop policy if exists procedure_documents_read on storage.objects;
create policy procedure_documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'procedure-documents'
    and (
      (
        name like 'sources/%'
        and public.has_any_role(array['admin', 'direction'])
        and exists (
          select 1
          from public.procedures procedure
          where procedure.source_storage_bucket = storage.objects.bucket_id
            and procedure.source_storage_path = storage.objects.name
        )
      )
      or (
        name like 'published/%'
        and public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin'])
        and exists (
          select 1
          from public.published_procedures publication
          where publication.storage_bucket = storage.objects.bucket_id
            and publication.storage_path = storage.objects.name
        )
      )
    )
  );

drop policy if exists procedure_documents_insert on storage.objects;
create policy procedure_documents_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'procedure-documents'
    and (name like 'sources/%' or name like 'published/%')
    and public.has_any_role(array['admin', 'direction'])
  );

drop policy if exists procedure_documents_update on storage.objects;
create policy procedure_documents_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'procedure-documents'
    and public.has_any_role(array['admin', 'direction'])
  )
  with check (
    bucket_id = 'procedure-documents'
    and (name like 'sources/%' or name like 'published/%')
    and public.has_any_role(array['admin', 'direction'])
  );

drop policy if exists procedure_documents_delete on storage.objects;
create policy procedure_documents_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'procedure-documents'
    and public.has_any_role(array['admin', 'direction'])
  );

create or replace function public.resolve_sharepoint_published_procedure_links()
returns table (
  target_table text,
  resolved_publications integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_count integer := 0;
begin
  if not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Insufficient permission to resolve QSMS publication links' using errcode = '42501';
  end if;

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
  return query values ('published_procedures', resolved_count);
end;
$$;

revoke all on function public.resolve_sharepoint_published_procedure_links() from public, anon, authenticated;
grant execute on function public.resolve_sharepoint_published_procedure_links() to authenticated;

comment on table public.procedures is
  'Private QSMS working documents. Row access is limited to Administration and Direction.';
comment on table public.published_procedures is
  'Immutable publication snapshots used to distribute PDF procedures to authenticated SeaPilot profiles.';
comment on column public.procedures.source_storage_path is
  'Private editable source object in the procedure-documents bucket. Historical SharePoint rows may remain NULL during migration.';
comment on column public.published_procedures.storage_path is
  'Private published PDF object in the procedure-documents bucket. Historical SharePoint rows may remain NULL during migration.';
