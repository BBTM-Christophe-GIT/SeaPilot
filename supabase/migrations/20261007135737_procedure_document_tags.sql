-- Tags are search metadata. Existing table RLS keeps source tags private and
-- exposes PDF tags only alongside publications the current profile can read.
alter table public.procedures
  add column tags text[] not null default '{}'::text[];
alter table public.published_procedures
  add column tags text[] not null default '{}'::text[];

create schema procedure_tags_private;
revoke all on schema procedure_tags_private from public, anon, authenticated;

create function procedure_tags_private.prepare_document_tags()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_tags text[];
begin
  -- Both the browser publication flow and the Drive RPC insert here. Inherit
  -- tags without requiring either caller to supply or expose source metadata.
  if tg_table_name = 'published_procedures' and tg_op = 'INSERT' then
    if new.procedure_id is not null then
      select source.tags into source_tags
      from public.procedures source
      where source.id = new.procedure_id
      for share;
      if found then
        new.tags := source_tags;
      end if;
    end if;
  end if;

  -- Keep the first spelling and the input order; collapse whitespace and ignore
  -- empty/null items and case-insensitive duplicates, including API writes.
  select coalesce(array_agg(tag order by ordinal), '{}'::text[])
  into new.tags
  from (
    select tag, ordinal,
      row_number() over (partition by lower(tag) order by ordinal) as duplicate_rank
    from (
      select normalize(btrim(regexp_replace(value, '[[:space:]]+', ' ', 'g')), NFC) as tag,
        ordinal
      from unnest(coalesce(new.tags, '{}'::text[])) with ordinality as supplied(value, ordinal)
    ) trimmed
    where nullif(tag, '') is not null
  ) normalized
  where duplicate_rank = 1;
  return new;
end;
$$;

create function procedure_tags_private.sync_publication_tags()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Match the current publication write policy. Invalid historical rows remain
  -- available for administrative audit and cannot block a source tag update.
  update public.published_procedures publication
  set tags = new.tags, updated_at = now()
  where publication.procedure_id = new.id
    and publication.tags is distinct from new.tags
    and publication.status = 'published'
    and lower(coalesce(publication.mime_type, '')) = 'application/pdf'
    and lower(coalesce(publication.file_name, '')) like '%.pdf'
    and (
      (publication.google_drive_path is not null and publication.drive_sha256 is not null)
      or (publication.storage_bucket = 'procedure-documents' and publication.storage_path like 'published/%')
    );
  return new;
end;
$$;

-- PostgreSQL invokes these functions only through their installed triggers.
-- Neither function is a client RPC, and neither bypasses the caller's RLS.
revoke all on function procedure_tags_private.prepare_document_tags() from public, anon, authenticated;
revoke all on function procedure_tags_private.sync_publication_tags() from public, anon, authenticated;

create trigger procedures_normalize_tags
before insert or update of tags on public.procedures
for each row execute function procedure_tags_private.prepare_document_tags();

create trigger published_procedures_prepare_tags
before insert or update of tags on public.published_procedures
for each row execute function procedure_tags_private.prepare_document_tags();

create trigger procedures_sync_publication_tags
after update of tags on public.procedures
for each row when (old.tags is distinct from new.tags)
execute function procedure_tags_private.sync_publication_tags();

comment on column public.procedures.tags is
  'Search tags maintained by Administration and Direction; changes synchronize complete linked published PDFs.';
comment on column public.published_procedures.tags is
  'Search tags inherited from the linked source, or maintained independently for a publication without a source.';
