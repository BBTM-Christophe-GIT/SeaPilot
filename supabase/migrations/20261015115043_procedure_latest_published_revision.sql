-- A publication replaces strictly older PDFs of the same numbered reference.
-- Deleting the published record revokes its application access; private file
-- archives keep the existing SeaPilot retention behaviour.
create schema procedure_revisions_private;
revoke all on schema procedure_revisions_private from public, anon, authenticated;

-- The row update also makes a concurrent stale REPEATABLE READ transaction
-- fail safely, instead of publishing from a snapshot taken before the winner.
create table procedure_revisions_private.reference_locks (
  reference text primary key,
  revision bigint not null default 1
);
revoke all on table procedure_revisions_private.reference_locks from public,anon,authenticated;

create function procedure_revisions_private.reference_key(theme text, document_number text)
returns text language sql immutable set search_path='' as $$
  select case when upper(btrim(theme)) ~ '^[A-Z][A-Z0-9]{0,15}$'
    and btrim(document_number) ~ '^[0-9]+([.][0-9]+)*$'
    then upper(btrim(theme)) || ':' || btrim(document_number) end;
$$;

-- Compare only unambiguous versions from the same family. Letter revisions use
-- A..Z, AA..AZ, BA...; numeric dotted revisions compare components numerically.
-- Equal and incomparable versions are deliberately retained.
create function procedure_revisions_private.compare_versions(left_version text, right_version text)
returns integer language plpgsql immutable set search_path='' as $$
declare l text:=upper(btrim(left_version)); r text:=upper(btrim(right_version));
  lv numeric:=0; rv numeric:=0; la numeric[]; ra numeric[]; i integer;
begin
  if l ~ '^[A-Z]{1,32}$' and r ~ '^[A-Z]{1,32}$' then
    for i in 1..length(l) loop lv:=lv*26+ascii(substr(l,i,1))-64; end loop;
    for i in 1..length(r) loop rv:=rv*26+ascii(substr(r,i,1))-64; end loop;
    return case when lv<rv then -1 when lv>rv then 1 else 0 end;
  elsif l ~ '^[0-9]{1,12}([.][0-9]{1,12}){0,15}$'
    and r ~ '^[0-9]{1,12}([.][0-9]{1,12}){0,15}$' then
    la:=string_to_array(l,'.')::numeric[]; ra:=string_to_array(r,'.')::numeric[];
    for i in 1..greatest(cardinality(la),cardinality(ra)) loop
      if coalesce(la[i],0)<coalesce(ra[i],0) then return -1; end if;
      if coalesce(la[i],0)>coalesce(ra[i],0) then return 1; end if;
    end loop;
    return 0;
  end if;
  return null;
end;
$$;

create function procedure_revisions_private.is_published_pdf(p public.published_procedures)
returns boolean language sql immutable set search_path='' as $$
  select p.status='published' and lower(p.mime_type)='application/pdf'
    and lower(p.file_name) like '%.pdf' and p.size_bytes>0
    and ((p.storage_bucket='procedure-documents' and p.storage_path like 'published/%')
      or (p.google_drive_path is not null and p.drive_sha256 ~ '^[a-f0-9]{64}$'));
$$;

create function procedure_revisions_private.lock_reference(theme text, document_number text)
returns void language plpgsql volatile set search_path='' as $$
declare lock_key text:=procedure_revisions_private.reference_key(theme,document_number);
begin
  if lock_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('procedure-pdf:'||lock_key,0));
    insert into procedure_revisions_private.reference_locks as locks(reference) values(lock_key)
      on conflict(reference) do update set revision=locks.revision+1;
  end if;
end;
$$;

create function procedure_revisions_private.guard_publication()
returns trigger language plpgsql security definer set search_path='' as $$
declare reference text; version text;
begin
  if not coalesce(procedure_revisions_private.is_published_pdf(new),false) then return new; end if;
  reference:=procedure_revisions_private.reference_key(new.theme,new.document_number);
  version:=coalesce(nullif(btrim(new.version_label),''),new.revision_label);
  if reference is null then return new; end if;
  perform procedure_revisions_private.lock_reference(new.theme,new.document_number);
  if tg_op='UPDATE' and coalesce(procedure_revisions_private.is_published_pdf(old),false)
    and procedure_revisions_private.reference_key(old.theme,old.document_number)=reference
    and procedure_revisions_private.compare_versions(coalesce(nullif(btrim(old.version_label),''),old.revision_label),version)>0 then
    raise exception 'Une publication PDF ne peut pas être rétrogradée.' using errcode='23514';
  end if;
  if exists(select 1 from public.published_procedures p
      where p.id is distinct from new.id and procedure_revisions_private.is_published_pdf(p)
        and procedure_revisions_private.reference_key(p.theme,p.document_number)=reference
        and procedure_revisions_private.compare_versions(coalesce(nullif(btrim(p.version_label),''),p.revision_label),version)>0) then
    raise exception 'Une version PDF plus récente de cette référence est déjà publiée.' using errcode='23514';
  end if;
  return new;
end;
$$;

create function procedure_revisions_private.remove_older_publications(replacement public.published_procedures)
returns bigint language plpgsql security definer set search_path='' as $$
declare old_ids bigint[]; removed bigint:=0;
begin
  if not coalesce(procedure_revisions_private.is_published_pdf(replacement),false)
    or procedure_revisions_private.reference_key(replacement.theme,replacement.document_number) is null then return 0; end if;
  perform procedure_revisions_private.lock_reference(replacement.theme,replacement.document_number);
  select array_agg(p.id) into old_ids from public.published_procedures p
    where p.id<>replacement.id and procedure_revisions_private.is_published_pdf(p)
      and procedure_revisions_private.reference_key(p.theme,p.document_number)=
        procedure_revisions_private.reference_key(replacement.theme,replacement.document_number)
      and procedure_revisions_private.compare_versions(coalesce(nullif(btrim(p.version_label),''),p.revision_label),
        coalesce(nullif(btrim(replacement.version_label),''),replacement.revision_label))<0;
  if old_ids is null then return 0; end if;
  if exists(select 1 from public.qhse_policy_settings where publication_id=any(old_ids))
    and not coalesce(replacement.ism_chapter ~ '^\s*02(\D|$)',false) then
    raise exception 'Le nouveau PDF doit rester admissible comme document de politique QHSE.' using errcode='23514';
  end if;
  -- Policy selections follow the same reference, preserving optimistic revision
  -- checks and leaving independently managed objectives/history unchanged.
  update public.qhse_policy_settings set publication_id=replacement.id,revision=revision+1,
    updated_at=clock_timestamp(),updated_by=coalesce(auth.uid(),updated_by)
    where publication_id=any(old_ids);
  delete from public.published_procedures where id=any(old_ids);
  get diagnostics removed=row_count;
  return removed;
end;
$$;

create function procedure_revisions_private.prune_publications()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform procedure_revisions_private.remove_older_publications(new);
  return new;
end;
$$;

revoke all on all functions in schema procedure_revisions_private from public,anon,authenticated;

create trigger published_procedures_latest_revision_guard
before insert or update of status,theme,document_number,version_label,revision_label,mime_type,file_name,storage_bucket,storage_path,size_bytes,google_drive_path,drive_sha256
on public.published_procedures for each row execute function procedure_revisions_private.guard_publication();
create trigger published_procedures_remove_older_revisions
after insert or update of status,theme,document_number,version_label,revision_label,mime_type,file_name,storage_bucket,storage_path,size_bytes,google_drive_path,drive_sha256
on public.published_procedures for each row execute function procedure_revisions_private.prune_publications();

-- Lock source -> reference -> prepared row, matching the Drive and uploaded-file
-- paths. A draft reservation does not supersede a published document.
create or replace function public.publish_procedure_blob(target_publication bigint)
returns public.published_procedures language plpgsql security definer set search_path='' as $$
declare publication public.published_procedures; verified public.document_blob_files; source public.procedures;
  publication_date date:=(now() at time zone 'Europe/Paris')::date;
begin
  if auth.uid() is null or not public.has_any_role(array['admin','direction']) then
    raise exception 'Publication non autorisée.' using errcode='42501';
  end if;
  select * into publication from public.published_procedures where id=target_publication;
  if publication.id is null or publication.published_by is distinct from auth.uid()
    or publication.google_drive_path is null then
    raise exception 'Publication préparée inaccessible.' using errcode='42501';
  end if;
  select * into source from public.procedures where id=publication.procedure_id for update;
  perform procedure_revisions_private.lock_reference(publication.theme,publication.document_number);
  select * into publication from public.published_procedures where id=target_publication for update;
  if publication.id is null or publication.published_by is distinct from auth.uid()
    or publication.google_drive_path is null then
    raise exception 'Publication préparée inaccessible.' using errcode='42501';
  end if;
  select * into verified from public.document_blob_files
    where source_bucket='procedure-publications-drive' and source_path=publication.id::text and active;
  if verified.id is null or verified.mime_type<>'application/pdf' or verified.sha256<>publication.drive_sha256
    or verified.bytes<>publication.size_bytes or verified.file_name<>publication.file_name then
    raise exception 'Vérifiez le PDF dans Blob avant de le publier.' using errcode='55000';
  end if;
  if publication.status='published' then return publication; end if;
  if publication.status<>'draft' then raise exception 'Cette publication est verrouillée.' using errcode='55000'; end if;
  if source.id is null
    or row(source.theme,source.document_number,source.version_label,source.revision_label)
      is distinct from row(publication.theme,publication.document_number,publication.version_label,publication.revision_label)
    or public.procedure_drive_pdf_name(source) is distinct from publication.google_drive_path then
    raise exception 'La source a changé depuis la préparation du PDF. Relancez la publication.' using errcode='40001';
  end if;
  update public.published_procedures set status='published',published_on=publication_date,diffusion_on=publication_date
    where id=publication.id returning * into publication;
  update public.procedures set status='published',published_on=publication_date,diffusion_on=publication_date
    where id=publication.procedure_id;
  return publication;
end;
$$;
revoke all on function public.publish_procedure_blob(bigint) from public,anon;
grant execute on function public.publish_procedure_blob(bigint) to authenticated;

-- Reconcile existing numbered references with the same strict comparison. The
-- current catalogue contains equal revisions; those are retained, including
-- ship-specific documents with the same version and unnumbered DNC templates.
do $$
declare p public.published_procedures;
begin
  for p in select candidate.* from public.published_procedures candidate
    where procedure_revisions_private.is_published_pdf(candidate)
      and not exists(select 1 from public.published_procedures newer
        where procedure_revisions_private.is_published_pdf(newer)
          and procedure_revisions_private.reference_key(newer.theme,newer.document_number)=
            procedure_revisions_private.reference_key(candidate.theme,candidate.document_number)
          and procedure_revisions_private.compare_versions(coalesce(nullif(btrim(newer.version_label),''),newer.revision_label),
            coalesce(nullif(btrim(candidate.version_label),''),candidate.revision_label))>0)
    order by candidate.id desc
  loop perform procedure_revisions_private.remove_older_publications(p); end loop;
end;
$$;

comment on function procedure_revisions_private.remove_older_publications(public.published_procedures) is
  'Deletes published PDF records for strictly lower comparable revisions of a global numbered reference; retains equal/ambiguous revisions, sources and private file archives.';
