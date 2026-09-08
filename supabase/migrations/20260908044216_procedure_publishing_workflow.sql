-- Simplify QSMS document replacement and make publication an explicit,
-- enforceable state for both metadata and private Storage objects.

alter table public.procedures
  drop constraint if exists procedures_status_check;

alter table public.procedures
  add constraint procedures_status_check
  check (status in ('draft', 'review', 'approved', 'published', 'archived', 'unknown'));

alter table public.published_procedures
  drop constraint if exists published_procedures_status_check;

alter table public.published_procedures
  add constraint published_procedures_status_check
  check (status in ('draft', 'review', 'approved', 'published', 'archived', 'unknown'));

-- Every object in the controlled publication folder is an actual PDF. Mark
-- those historical records explicitly and complete missing diffusion dates
-- from their preserved publication date.
update public.published_procedures
set status = 'published',
    diffusion_on = coalesce(diffusion_on, published_on),
    updated_at = now()
where storage_bucket = 'procedure-documents'
  and storage_path like 'published/%'
  and lower(coalesce(mime_type, '')) = 'application/pdf'
  and lower(coalesce(file_name, '')) like '%.pdf';

with latest_publication as (
  select distinct on (procedure_id)
    procedure_id,
    published_on,
    diffusion_on
  from public.published_procedures
  where procedure_id is not null
    and status = 'published'
    and storage_bucket = 'procedure-documents'
    and storage_path like 'published/%'
    and lower(coalesce(mime_type, '')) = 'application/pdf'
    and lower(coalesce(file_name, '')) like '%.pdf'
  order by procedure_id, published_on desc nulls last, id desc
)
update public.procedures as procedure
set status = 'published',
    published_on = coalesce(procedure.published_on, publication.published_on),
    diffusion_on = coalesce(procedure.diffusion_on, publication.diffusion_on, publication.published_on),
    updated_at = now()
from latest_publication as publication
where publication.procedure_id = procedure.id;

-- Retire the redundant SharePoint-era approval field. The single status
-- column now carries the complete lifecycle, including "published".
delete from public.sharepoint_field_mappings
where target_table in ('procedures', 'published_procedures')
  and target_column = 'approval_status';

alter table public.procedures
  drop column if exists approval_status;

alter table public.published_procedures
  drop column if exists approval_status;

-- Legacy SharePoint data contains a few duplicate Theme + Number pairs.
-- Preserve the oldest identifier and assign deterministic dotted suffixes to
-- the remaining source documents before enabling the unique index.
do $$
declare
  duplicate_row record;
  base_number text;
  candidate_number text;
  suffix integer;
begin
  for duplicate_row in
    select id, theme, document_number, version_label, revision_label,
           row_number() over (
             partition by lower(btrim(theme)), lower(btrim(document_number))
             order by id
           ) as duplicate_rank
    from public.procedures
    where nullif(btrim(theme), '') is not null
      and nullif(btrim(document_number), '') is not null
    order by lower(btrim(theme)), lower(btrim(document_number)), id
  loop
    if duplicate_row.duplicate_rank > 1 then
      base_number := regexp_replace(btrim(duplicate_row.document_number), '\..*$', '');
      suffix := 1;

      loop
        candidate_number := base_number || '.' || suffix::text;
        exit when not exists (
          select 1
          from public.procedures existing
          where existing.id <> duplicate_row.id
            and lower(btrim(existing.theme)) = lower(btrim(duplicate_row.theme))
            and lower(btrim(existing.document_number)) = lower(candidate_number)
        );
        suffix := suffix + 1;
      end loop;

      update public.procedures
      set document_number = candidate_number,
          procedure_code = btrim(duplicate_row.theme) || ' ' || candidate_number ||
            case
              when nullif(btrim(coalesce(duplicate_row.version_label, duplicate_row.revision_label, '')), '') is null
                then ''
              else '-' || upper(btrim(coalesce(duplicate_row.version_label, duplicate_row.revision_label)))
            end,
          updated_at = now()
      where id = duplicate_row.id;
    end if;
  end loop;
end;
$$;

alter table public.procedures
  drop constraint if exists procedures_document_number_format_check;

alter table public.procedures
  add constraint procedures_document_number_format_check
  check (
    document_number is null
    or nullif(btrim(document_number), '') is null
    or btrim(document_number) ~ '^[0-9]+([.][0-9]+)*$'
  );

create unique index if not exists procedures_theme_document_number_unique_idx
  on public.procedures (lower(btrim(theme)), lower(btrim(document_number)))
  where nullif(btrim(theme), '') is not null
    and nullif(btrim(document_number), '') is not null;

-- Operational profiles may only see metadata for explicitly published PDFs.
-- Administration and Direction retain access to legacy records for cleanup.
drop policy if exists published_procedures_role_read on public.published_procedures;
create policy published_procedures_role_read on public.published_procedures
  for select to authenticated
  using (
    public.has_any_role(array['admin', 'direction'])
    or (
      public.has_any_role(array['armement', 'capitaine', 'marin'])
      and status = 'published'
      and storage_bucket = 'procedure-documents'
      and storage_path like 'published/%'
      and lower(coalesce(mime_type, '')) = 'application/pdf'
      and lower(coalesce(file_name, '')) like '%.pdf'
    )
  );

drop policy if exists published_procedures_administration_write on public.published_procedures;
create policy published_procedures_administration_write on public.published_procedures
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction']))
  with check (
    public.has_any_role(array['admin', 'direction'])
    and status = 'published'
    and storage_bucket = 'procedure-documents'
    and storage_path like 'published/%'
    and lower(coalesce(mime_type, '')) = 'application/pdf'
    and lower(coalesce(file_name, '')) like '%.pdf'
  );

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
        and exists (
          select 1
          from public.published_procedures publication
          where publication.storage_bucket = storage.objects.bucket_id
            and publication.storage_path = storage.objects.name
            and (
              public.has_any_role(array['admin', 'direction'])
              or (
                public.has_any_role(array['armement', 'capitaine', 'marin'])
                and publication.status = 'published'
                and lower(coalesce(publication.mime_type, '')) = 'application/pdf'
                and lower(coalesce(publication.file_name, '')) like '%.pdf'
              )
            )
        )
      )
    )
  );

comment on column public.procedures.status is
  'QSMS lifecycle: draft, review, approved, published, archived, or unknown. Publication is set only after a confirmed PDF diffusion.';

comment on column public.procedures.document_number is
  'Editable dotted number that is unique within a normalized QSMS theme.';
