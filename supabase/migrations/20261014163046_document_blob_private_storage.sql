-- One verified private Blob location per logical document reference. Existing
-- Storage/Drive/business references remain provenance; this migration purges none.
create schema if not exists document_blob_private;
revoke all on schema document_blob_private from public, anon;
grant usage on schema document_blob_private to authenticated, service_role;

create table public.document_blob_files (
  id uuid primary key default gen_random_uuid(),
  source_bucket text not null,
  source_path text not null,
  provider text not null default 'vercel-blob' check (provider='vercel-blob'),
  blob_pathname text not null,
  blob_url text not null,
  file_name text not null check (length(file_name) between 1 and 255 and file_name !~ '[/\\[:cntrl:]]'),
  mime_type text not null check (length(mime_type) between 1 and 200),
  bytes bigint not null check (bytes between 1 and 104857600),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz not null,
  active boolean not null default true,
  uploader_id uuid references auth.users(id),
  original_owner_id text,
  upload_context jsonb not null default '{}'::jsonb check (jsonb_typeof(upload_context)='object'),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance)='object'),
  created_at timestamptz not null default now(),
  constraint document_blob_files_source_unique unique (source_bucket,source_path),
  constraint document_blob_files_source_valid check (
    length(source_bucket) between 1 and 100 and length(source_path) between 1 and 2000
    and source_path !~ '(^/|(^|/)\.\.?(/|$)|[\\[:cntrl:]])'),
  constraint document_blob_files_path_valid check (
    blob_pathname like 'documents/%' and length(blob_pathname) between 1 and 2000
    and blob_pathname !~ '(^/|(^|/)\.\.?(/|$)|[\\[:cntrl:]])'),
  constraint document_blob_files_private_url check (
    blob_url ~ '^https://[a-z0-9-]+[.]private[.]blob[.]vercel-storage[.]com/[^?#]+$'),
  constraint document_blob_files_procedure_pdf check (
    (source_bucket<>'procedure-documents' or source_path like 'published/%')
    and (source_bucket not in ('procedure-documents','procedure-publications-drive')
      or (mime_type='application/pdf' and lower(file_name) like '%.pdf')))
);
comment on table public.document_blob_files is
  'Server-verified private Vercel Blob bytes; logical keys preserve historical business references and their actual RLS.';
alter table public.document_blob_files enable row level security;
revoke all on public.document_blob_files from public,anon,authenticated;
grant select on public.document_blob_files to authenticated;
grant all on public.document_blob_files to service_role;

-- Evaluate the live Storage policies on a virtual metadata tuple. No Storage
-- object is inserted, and invoker queries keep business-table RLS. This includes
-- restrictive policies (including source freezes), not only permissive rules.
create function document_blob_private.storage_allowed(
  target_operation text,target_bucket text,target_path text,target_owner text default null)
returns boolean language plpgsql stable security invoker
set search_path=public,storage,pg_temp as $$
declare permissive text; restrictive text; allowed boolean; command "char";
begin
  if auth.uid() is null or target_operation not in ('read','upload') then return false; end if;
  command:=case target_operation when 'read' then 'r'::"char" else 'a'::"char" end;
  select string_agg('('||expression||')',' OR ') filter(where polpermissive),
    string_agg('('||expression||')',' AND ') filter(where not polpermissive)
  into permissive,restrictive
  from (
    select policy.polpermissive,
      pg_get_expr(case when command='a' then coalesce(policy.polwithcheck,policy.polqual)
        else policy.polqual end,policy.polrelid) expression
    from pg_catalog.pg_policy policy
    where policy.polrelid='storage.objects'::regclass and policy.polcmd in (command,'*'::"char")
      and (0=any(policy.polroles) or (select oid from pg_catalog.pg_roles where rolname='authenticated')=any(policy.polroles))
  ) policies where expression is not null;
  if permissive is null then return false; end if;
  execute 'select coalesce(('||permissive||') AND ('||coalesce(restrictive,'true')||'),false)
    from (select $1::text bucket_id,$2::text name,$3::text owner_id) objects'
  into allowed using target_bucket,target_path,target_owner;
  return coalesce(allowed,false);
end;
$$;
revoke all on function document_blob_private.storage_allowed(text,text,text,text) from public,anon;
grant execute on function document_blob_private.storage_allowed(text,text,text,text) to authenticated,service_role;

create function public.document_blob_can_read(target_bucket text,target_path text)
returns boolean language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null then return false; end if;
  case target_bucket
    when 'hr-drive' then
      return target_path ~ '^[1-9][0-9]*$' and exists(
        select 1 from public.hr_documents d where d.id::text=target_path and d.drive_path is not null);
    when 'chemical-drive' then
      return exists(select 1 from public.chemical_attachments d where d.id::text=target_path);
    when 'procedure-publications-drive' then
      return exists(select 1 from public.published_procedures d where d.id::text=target_path
        and d.status='published' and d.google_drive_path is not null and d.mime_type='application/pdf'
        and lower(d.file_name) like '%.pdf');
    when 'project-drive' then
      return exists(select 1 from public.project_drive_files d where d.id::text=target_path);
    when 'disciplinary-drive' then
      return exists(select 1 from public.disciplinary_documents d
        join public.disciplinary_cases c on c.id=d.case_id
        where d.id::text=target_path and public.disciplinary_has_access(c.company_id));
    when 'purchase-request-external' then
      return exists(select 1 from public.purchase_request_attachments d
        where d.id::text=target_path and nullif(btrim(d.file_url),'') is not null);
    when 'service-note-source' then
      return exists(select 1 from public.qhse_service_notes d where d.id::text=target_path
        and nullif(btrim(d.source_web_url),'') is not null and public.service_note_can_read(d.id));
    when 'service-note-external' then
      return exists(select 1 from public.qhse_service_note_attachments d where d.id::text=target_path
        and nullif(btrim(d.external_url),'') is not null and public.service_note_can_read(d.note_id));
    else
      if target_bucket='procedure-documents' and target_path not like 'published/%' then return false; end if;
      return document_blob_private.storage_allowed('read',target_bucket,target_path)
        or (document_drive_private.has_mapping(target_bucket,target_path)
          and public.document_drive_can_read(target_bucket,target_path));
  end case;
end;
$$;
revoke all on function public.document_blob_can_read(text,text) from public,anon;
grant execute on function public.document_blob_can_read(text,text) to authenticated,service_role;


-- Bucket configuration is not exposed by Storage bucket-list RLS. Return only
-- upload limits, never object metadata or any credentials.
create function document_blob_private.bucket_limits(target_bucket text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',id,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types)
  from storage.buckets where id=target_bucket and auth.uid() is not null;
$$;
revoke all on function document_blob_private.bucket_limits(text) from public,anon;
grant execute on function document_blob_private.bucket_limits(text) to authenticated,service_role;

create function public.document_blob_can_upload(
  target_bucket text,target_path text,target_mime_type text,target_bytes bigint,target_context jsonb default '{}'::jsonb)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare bucket storage.buckets; target_person public.people; target_product public.chemical_products;
  target_case public.disciplinary_cases; publication public.published_procedures;
begin
  if auth.uid() is null or target_path is null or length(target_path) not between 1 and 2000
    or target_path ~ '(^/|(^|/)\.\.?(/|$)|[\\[:cntrl:]])'
    or target_bytes is null or target_bytes not between 1 and 104857600
    or target_mime_type is null or length(target_mime_type) not between 1 and 200
    or jsonb_typeof(target_context) is distinct from 'object' then return false; end if;
  case target_bucket
    when 'chemical-drive' then
      if target_path !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
        or target_bytes>26214400 or target_mime_type not in ('application/pdf','image/png','image/jpeg',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain') then return false; end if;
      select * into target_product from public.chemical_products
        where id::text=target_context->>'product_id' and deleted_at is null;
      return target_product.id is not null and public.chemical_has_access(target_product.company_id)
        and not exists(select 1 from public.chemical_attachments a
          where a.id::text=target_path and a.product_id<>target_product.id);
    when 'disciplinary-drive' then
      if target_path !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
        or target_bytes>26214400 or target_mime_type not in ('application/pdf','image/png','image/jpeg',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain',
          'application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet',
          'application/vnd.oasis.opendocument.presentation') then return false; end if;
      select * into target_case from public.disciplinary_cases where id::text=target_context->>'case_id';
      return target_case.id is not null and public.disciplinary_has_access(target_case.company_id)
        and not exists(select 1 from public.disciplinary_documents d
          where d.id::text=target_path and d.case_id<>target_case.id);
    when 'procedure-publications-drive' then
      select * into publication from public.published_procedures where id::text=target_path;
      return public.has_any_role(array['admin','direction']) and publication.id is not null
        and publication.published_by=auth.uid()
        and publication.google_drive_path is not null and publication.mime_type='application/pdf'
        and target_mime_type='application/pdf' and target_bytes=publication.size_bytes
        and target_bytes<=26214400;
    when 'hr-drive' then
      return false; -- New RH uploads use canonical hr-documents/people/<person>/ paths.
    when 'project-drive' then
      return false; -- New project uploads use canonical project-files paths.
    else
      if target_bucket='procedure-documents' and (target_path not like 'published/%'
        or target_mime_type<>'application/pdf') then return false; end if;
      bucket:=jsonb_populate_record(null::storage.buckets,document_blob_private.bucket_limits(target_bucket));
      if bucket.id is null or (bucket.file_size_limit is not null and target_bytes>bucket.file_size_limit)
        or (bucket.allowed_mime_types is not null and not exists(
          select 1 from unnest(bucket.allowed_mime_types) mime where lower(mime)=lower(target_mime_type))) then return false; end if;
      if target_bucket='hr-documents' then
        if target_path !~ '^people/[1-9][0-9]*/[^/]+$' then return false; end if;
        select * into target_person from public.people where id::text=split_part(target_path,'/',2);
        if target_person.id is null or target_person.company_id<>public.current_planning_company_id()
          or not public.has_any_role(array['admin','direction','armement']) then return false; end if;
      end if;
      return document_blob_private.storage_allowed('upload',target_bucket,target_path,auth.uid()::text);
  end case;
end;
$$;
revoke all on function public.document_blob_can_upload(text,text,text,bigint,jsonb) from public,anon;
grant execute on function public.document_blob_can_upload(text,text,text,bigint,jsonb) to authenticated,service_role;


-- Broad company/bucket read policies must not publish an unlinked new upload.
-- Other Storage read policies already require a linked, RLS-visible business row.
create function document_blob_private.business_linked(target_bucket text,target_path text)
returns boolean language plpgsql stable security invoker set search_path='' as $$
begin
  case target_bucket
    when 'fleet-certificates' then
      return exists(select 1 from public.fleet_certificate_versions d where d.storage_bucket=target_bucket and d.storage_path=target_path)
        or exists(select 1 from public.fleet_certificates d where d.storage_path=target_path)
        or exists(select 1 from public.fleet_certificate_finding_attachments d where d.storage_path=target_path)
        or exists(select 1 from public.lsa_items d where d.storage_path=target_path)
        or exists(select 1 from public.lsa_versions d where d.storage_path=target_path)
        or exists(select 1 from public.lifting_inspections d where d.storage_path=target_path);
    when 'purchase-request-attachments' then
      return exists(select 1 from public.purchase_request_attachments d
        where d.storage_bucket=target_bucket and d.storage_path=target_path);
    when 'fleet-media' then
      return exists(select 1 from public.vessels d
        where d.illustration_storage_bucket=target_bucket and d.illustration_storage_path=target_path);
    else return true;
  end case;
end;
$$;
revoke all on function document_blob_private.business_linked(text,text) from public,anon;
grant execute on function document_blob_private.business_linked(text,text) to authenticated,service_role;


-- ID aliases are snapshots of a particular legacy reference, not a license to
-- serve an obsolete RH renewal or any other reused business ID.
create function document_blob_private.reference_matches(target_bucket text,target_path text,target_reference text,
  target_file_name text,target_mime text,target_bytes bigint,target_sha text,target_uploader uuid)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare h public.hr_documents; c public.chemical_attachments; p public.published_procedures;
  f public.project_drive_files; d public.disciplinary_documents;
begin
  case target_bucket
    when 'hr-drive' then
      select * into h from public.hr_documents where id::text=target_path;
      return h.id is not null and h.drive_path is not null and h.drive_path=target_reference
        and (h.drive_sha256 is null or h.drive_sha256=target_sha)
        and (h.file_size_bytes is null or h.file_size_bytes=target_bytes)
        and (h.mime_type is null or lower(h.mime_type)=lower(target_mime));
    when 'chemical-drive' then
      select * into c from public.chemical_attachments where id::text=target_path;
      if c.id is null then return target_uploader=auth.uid(); end if;
      return (target_reference is null or c.drive_path=target_reference)
        and c.sha256=target_sha and c.size_bytes=target_bytes
        and c.file_name=target_file_name and lower(c.mime_type)=lower(target_mime);
    when 'procedure-publications-drive' then
      select * into p from public.published_procedures where id::text=target_path;
      return p.id is not null and p.google_drive_path=target_reference and p.drive_sha256=target_sha
        and p.size_bytes=target_bytes and p.file_name=target_file_name and p.mime_type=target_mime;
    when 'project-drive' then
      select * into f from public.project_drive_files where id::text=target_path;
      return f.id is not null and f.path=target_reference and f.sha256=target_sha
        and f.bytes=target_bytes and lower(f.mime_type)=lower(target_mime);
    when 'disciplinary-drive' then
      select * into d from public.disciplinary_documents where id::text=target_path;
      if d.id is null then return target_uploader=auth.uid(); end if;
      return (target_reference is null or d.drive_path=target_reference) and d.file_name=target_file_name;
    when 'purchase-request-external' then
      return exists(select 1 from public.purchase_request_attachments a
        where a.id::text=target_path and a.file_url=target_reference);
    when 'service-note-source' then
      return exists(select 1 from public.qhse_service_notes n
        where n.id::text=target_path and n.source_web_url=target_reference);
    when 'service-note-external' then
      return exists(select 1 from public.qhse_service_note_attachments a
        where a.id::text=target_path and a.external_url=target_reference);
    else return true;
  end case;
end;
$$;
revoke all on function document_blob_private.reference_matches(text,text,text,text,text,bigint,text,uuid) from public,anon;
grant execute on function document_blob_private.reference_matches(text,text,text,text,text,bigint,text,uuid) to authenticated,service_role;

create function document_blob_private.source_reference(target_bucket text,target_path text)
returns text language plpgsql stable security definer set search_path='' as $$
declare reference text;
begin
  case target_bucket
    when 'hr-drive' then select drive_path into reference from public.hr_documents where id::text=target_path;
    when 'chemical-drive' then select drive_path into reference from public.chemical_attachments where id::text=target_path;
    when 'procedure-publications-drive' then select google_drive_path into reference from public.published_procedures where id::text=target_path;
    when 'project-drive' then select path into reference from public.project_drive_files where id::text=target_path;
    when 'disciplinary-drive' then select drive_path into reference from public.disciplinary_documents where id::text=target_path;
    when 'purchase-request-external' then select file_url into reference from public.purchase_request_attachments where id::text=target_path;
    when 'service-note-source' then select source_web_url into reference from public.qhse_service_notes where id::text=target_path;
    when 'service-note-external' then select external_url into reference from public.qhse_service_note_attachments where id::text=target_path;
    else reference:=target_path;
  end case;
  return reference;
end;
$$;
revoke all on function document_blob_private.source_reference(text,text) from public,anon,authenticated;
grant execute on function document_blob_private.source_reference(text,text) to service_role;

create policy document_blob_files_read on public.document_blob_files for select to authenticated using(
  active and document_blob_private.reference_matches(source_bucket,source_path,provenance->>'source_reference',
    file_name,mime_type,bytes,sha256,uploader_id)
    and ((public.document_blob_can_read(source_bucket,source_path)
    and (uploader_id is null or document_blob_private.business_linked(source_bucket,source_path)))
    or (uploader_id=auth.uid() and public.document_blob_can_upload(source_bucket,source_path,mime_type,bytes,upload_context))));

create function document_blob_private.has_mapping(target_bucket text,target_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.document_blob_files
    where source_bucket=target_bucket and source_path=target_path);
$$;
revoke all on function document_blob_private.has_mapping(text,text) from public,anon;
grant execute on function document_blob_private.has_mapping(text,text) to authenticated,service_role;

create function public.document_blob_lookup(target_bucket text,target_path text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare d public.document_blob_files;
begin
  if auth.uid() is null then raise exception 'Connexion SeaPilot requise.' using errcode='42501'; end if;
  select * into d from public.document_blob_files where source_bucket=target_bucket and source_path=target_path and active;
  if not found then
    if document_blob_private.has_mapping(target_bucket,target_path) then
      raise exception 'Document inaccessible pour ce profil.' using errcode='42501';
    end if;
    return null;
  end if;
  return jsonb_build_object('id',d.id,'provider',d.provider,'blob_pathname',d.blob_pathname,'blob_url',d.blob_url,
    'file_name',d.file_name,'mime_type',d.mime_type,'bytes',d.bytes,'sha256',d.sha256,'source_sha256',d.source_sha256,
    'verified_at',d.verified_at);
end;
$$;
revoke all on function public.document_blob_lookup(text,text) from public,anon;
grant execute on function public.document_blob_lookup(text,text) to authenticated,service_role;

create table document_blob_private.uploads (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null default auth.uid() references auth.users(id),
  source_bucket text not null,
  source_path text not null,
  file_name text not null,
  mime_type text not null,
  bytes bigint not null check(bytes between 1 and 104857600),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '1 hour',
  completed_at timestamptz
);
alter table document_blob_private.uploads enable row level security;
revoke all on document_blob_private.uploads from public,anon,authenticated;
grant select,insert on document_blob_private.uploads to authenticated;
grant all on document_blob_private.uploads to service_role;
create policy document_blob_uploads_read on document_blob_private.uploads for select to authenticated
  using(uploader_id=auth.uid());
create policy document_blob_uploads_create on document_blob_private.uploads for insert to authenticated
  with check(uploader_id=auth.uid() and completed_at is null
    and created_at between now()-interval '1 minute' and now()
    and expires_at between now() and now()+interval '1 hour'
    and length(file_name) between 1 and 255 and file_name !~ '[/\\[:cntrl:]]'
    and public.document_blob_can_upload(source_bucket,source_path,mime_type,bytes,context));


-- INSERT does not grant replacement of a pre-existing Storage object or an
-- append-only desktop attachment. New versions need a fresh logical key.
create function document_blob_private.legacy_source_exists(target_bucket text,target_path text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then return false; end if;
  case target_bucket
    when 'chemical-drive' then return exists(select 1 from public.chemical_attachments where id::text=target_path);
    when 'disciplinary-drive' then return exists(select 1 from public.disciplinary_documents where id::text=target_path);
    else return exists(select 1 from storage.objects where bucket_id=target_bucket and name=target_path);
  end case;
end;
$$;
revoke all on function document_blob_private.legacy_source_exists(text,text) from public,anon;
grant execute on function document_blob_private.legacy_source_exists(text,text) to authenticated,service_role;

create function public.document_blob_upload_scope(target_bucket text,target_path text,target_file_name text,
  target_mime_type text,target_bytes bigint,target_sha256 text,target_context jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare reservation document_blob_private.uploads;
begin
  if not public.document_blob_can_upload(target_bucket,target_path,target_mime_type,target_bytes,target_context) then
    raise exception 'Téléversement refusé pour ce document.' using errcode='42501';
  end if;
  if target_file_name is null or length(target_file_name) not between 1 and 255 or target_file_name ~ '[/\\[:cntrl:]]'
    or target_sha256 is null or target_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Métadonnées de fichier invalides.' using errcode='22023';
  end if;
  if document_blob_private.has_mapping(target_bucket,target_path)
    or document_blob_private.legacy_source_exists(target_bucket,target_path) then
    raise exception 'Ce document vérifié ne peut pas être remplacé. Utilisez une nouvelle version.' using errcode='23505';
  end if;
  if target_bucket='procedure-publications-drive' and not exists(select 1 from public.published_procedures
    where id::text=target_path and drive_sha256=target_sha256 and file_name=target_file_name) then
    raise exception 'Le PDF ne correspond pas à la publication préparée.' using errcode='22023';
  end if;
  select * into reservation from document_blob_private.uploads
    where uploader_id=auth.uid() and source_bucket=target_bucket and source_path=target_path
      and file_name=target_file_name and mime_type=target_mime_type and bytes=target_bytes
      and sha256=target_sha256 and context=target_context and completed_at is null and expires_at>now()
    order by created_at desc limit 1;
  if not found then
    insert into document_blob_private.uploads(source_bucket,source_path,file_name,mime_type,bytes,sha256,context)
    values(target_bucket,target_path,target_file_name,target_mime_type,target_bytes,target_sha256,target_context)
    returning * into reservation;
  end if;
  return to_jsonb(reservation)||jsonb_build_object('upload_id',reservation.id,
    'blob_pathname','documents/uploads/'||reservation.id::text);
end;
$$;
revoke all on function public.document_blob_upload_scope(text,text,text,text,bigint,text,jsonb) from public,anon;
grant execute on function public.document_blob_upload_scope(text,text,text,text,bigint,text,jsonb) to authenticated;

create function public.document_blob_upload_revalidate(target_upload_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare reservation document_blob_private.uploads;
begin
  select * into reservation from document_blob_private.uploads where id=target_upload_id and uploader_id=auth.uid();
  if reservation.id is null or reservation.expires_at<=now()
    or not public.document_blob_can_upload(reservation.source_bucket,reservation.source_path,reservation.mime_type,reservation.bytes,reservation.context) then
    raise exception 'Téléversement expiré ou devenu inaccessible.' using errcode='42501';
  end if;
  return to_jsonb(reservation)||jsonb_build_object('upload_id',reservation.id,
    'blob_pathname','documents/uploads/'||reservation.id::text);
end;
$$;
revoke all on function public.document_blob_upload_revalidate(uuid) from public,anon;
grant execute on function public.document_blob_upload_revalidate(uuid) to authenticated;

-- Called only by the trusted server after re-reading private Blob bytes and
-- matching SHA-256, size and MIME. Migration registration does not change source
-- metadata. A retry can return the same mapping, never overwrite a different one.
create function public.document_blob_register_verified(p_record jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare reservation document_blob_private.uploads; d public.document_blob_files;
  actor uuid; migration boolean:=coalesce((p_record->>'migration')::boolean,false);
  bucket text:=p_record->>'source_bucket'; path text:=p_record->>'source_path';
begin
  if current_user<>'service_role' then raise exception 'Enregistrement serveur requis.' using errcode='42501'; end if;
  if jsonb_typeof(p_record) is distinct from 'object' or p_record->>'sha256' is distinct from p_record->>'verified_sha256'
    or (p_record->>'bytes')::bigint is distinct from (p_record->>'verified_bytes')::bigint
    or p_record->>'mime_type' is distinct from p_record->>'verified_mime_type' then
    raise exception 'Preuve binaire absente ou incohérente.' using errcode='22023';
  end if;
  if not migration then
    select * into reservation from document_blob_private.uploads where id=(p_record->>'upload_id')::uuid for update;
    if reservation.id is null or reservation.expires_at<=now()
      or reservation.source_bucket is distinct from bucket or reservation.source_path is distinct from path
      or reservation.uploader_id::text is distinct from p_record->>'uploader_id'
      or reservation.file_name is distinct from p_record->>'file_name'
      or reservation.mime_type is distinct from p_record->>'mime_type'
      or reservation.bytes is distinct from (p_record->>'bytes')::bigint
      or reservation.sha256 is distinct from p_record->>'sha256'
      or p_record->>'blob_pathname' is distinct from 'documents/uploads/'||reservation.id::text then
      raise exception 'La preuve ne correspond pas au téléversement réservé.' using errcode='22023';
    end if;
    actor:=reservation.uploader_id;
  else
    if p_record->>'source_sha256' is null then raise exception 'Empreinte source requise.' using errcode='22023'; end if;
  end if;
  insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,file_name,mime_type,
    bytes,sha256,source_sha256,verified_at,uploader_id,original_owner_id,upload_context,provenance)
  values(bucket,path,p_record->>'blob_pathname',p_record->>'blob_url',p_record->>'file_name',p_record->>'mime_type',
    (p_record->>'bytes')::bigint,p_record->>'sha256',coalesce(p_record->>'source_sha256',p_record->>'sha256'),
    clock_timestamp(),actor,coalesce(actor::text,p_record->>'original_owner_id'),
    coalesce(reservation.context,p_record->'context','{}'::jsonb),coalesce(p_record->'provenance','{}'::jsonb)
      ||jsonb_build_object('source_reference',document_blob_private.source_reference(bucket,path)))
  on conflict(source_bucket,source_path) do nothing returning * into d;
  if d.id is null then
    select * into d from public.document_blob_files where source_bucket=bucket and source_path=path;
    if not d.active or d.blob_pathname is distinct from p_record->>'blob_pathname'
      or d.blob_url is distinct from p_record->>'blob_url' or d.sha256 is distinct from p_record->>'sha256'
      or d.bytes is distinct from (p_record->>'bytes')::bigint or d.mime_type is distinct from p_record->>'mime_type'
      or d.file_name is distinct from p_record->>'file_name' or d.uploader_id is distinct from actor then
      raise exception 'Un document différent est déjà enregistré pour cette référence.' using errcode='23505';
    end if;
  end if;
  if reservation.id is not null then
    update document_blob_private.uploads set completed_at=coalesce(completed_at,clock_timestamp()) where id=reservation.id;
  end if;
  return jsonb_build_object('id',d.id,'source_bucket',d.source_bucket,'source_path',d.source_path,
    'provider',d.provider,'blob_pathname',d.blob_pathname,'blob_url',d.blob_url,
    'file_name',d.file_name,'mime_type',d.mime_type,'sha256',d.sha256,'source_sha256',d.source_sha256,
    'bytes',d.bytes,'verified_at',d.verified_at);
end;
$$;
revoke all on function public.document_blob_register_verified(jsonb) from public,anon,authenticated;
grant execute on function public.document_blob_register_verified(jsonb) to service_role;

-- A converted PDF receipt is private while its bytes are being verified.
-- Word/Excel source workflows and all existing Drive paths remain intact.
create function public.prepare_procedure_blob_publication(
  target_procedure bigint,pdf_path text,pdf_bytes bigint,pdf_sha256 text)
returns public.published_procedures language plpgsql security definer set search_path='' as $$
declare source public.procedures; publication public.published_procedures;
begin
  if auth.uid() is null or not public.has_any_role(array['admin','direction']) then
    raise exception 'Publication non autorisée.' using errcode='42501';
  end if;
  select * into source from public.procedures where id=target_procedure for update;
  if source.id is null or source.source_google_drive_path is null then
    raise exception 'Source Drive introuvable.' using errcode='22023';
  end if;
  if pdf_path is null or pdf_path<>public.procedure_drive_pdf_name(source)
    or not public.procedure_drive_path_valid(pdf_path,true) or pdf_path like '%/%'
    or pdf_bytes is null or pdf_bytes not between 1 and 26214400
    or pdf_sha256 is null or pdf_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Reçu PDF invalide.' using errcode='22023';
  end if;
  select * into publication from public.published_procedures where lower(google_drive_path)=lower(pdf_path);
  if publication.id is not null then
    if publication.procedure_id<>source.id or publication.drive_sha256<>pdf_sha256 or publication.size_bytes<>pdf_bytes
      or (publication.status<>'published' and publication.published_by is distinct from auth.uid()) then
      raise exception 'Cette version PDF est déjà réservée. Changez la version du document.' using errcode='23505';
    end if;
    return publication;
  end if;
  insert into public.published_procedures(
    procedure_id,procedure_code,title,status,revision_label,published_on,source_label,notes,
    category_label,diffusion_on,description,regulatory_requirement,ism_chapter,vessel_name,project_name,
    document_number,restrictions,annual_review,theme,document_type,bridge_watch,version_label,
    file_name,mime_type,size_bytes,google_drive_path,drive_sha256,published_by)
  values(source.id,source.procedure_code,pdf_path,'draft',source.revision_label,null,'seapilot',source.notes,
    source.category_label,null,source.description,source.regulatory_requirement,source.ism_chapter,
    source.vessel_name,source.project_name,source.document_number,source.restrictions,source.annual_review,
    source.theme,source.document_type,source.bridge_watch,source.version_label,
    pdf_path,'application/pdf',pdf_bytes,pdf_path,pdf_sha256,auth.uid())
  returning * into publication;
  return publication;
end;
$$;
revoke all on function public.prepare_procedure_blob_publication(bigint,text,bigint,text) from public,anon;
grant execute on function public.prepare_procedure_blob_publication(bigint,text,bigint,text) to authenticated;

create function public.publish_procedure_blob(target_publication bigint)
returns public.published_procedures language plpgsql security definer set search_path='' as $$
declare publication public.published_procedures; verified public.document_blob_files;
  publication_date date:=(now() at time zone 'Europe/Paris')::date;
begin
  if auth.uid() is null or not public.has_any_role(array['admin','direction']) then
    raise exception 'Publication non autorisée.' using errcode='42501';
  end if;
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
  update public.published_procedures set status='published',published_on=publication_date,diffusion_on=publication_date
    where id=publication.id returning * into publication;
  update public.procedures set status='published',published_on=publication_date,diffusion_on=publication_date
    where id=publication.procedure_id;
  return publication;
end;
$$;
revoke all on function public.publish_procedure_blob(bigint) from public,anon;
grant execute on function public.publish_procedure_blob(bigint) to authenticated;

CREATE OR REPLACE FUNCTION public.procedure_drive_scope(target_action text, target_procedure bigint DEFAULT NULL::bigint, target_publication bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare source public.procedures; publication public.published_procedures;
begin
  if auth.uid() is null then raise exception 'Connexion SeaPilot requise' using errcode = '42501'; end if;
  if coalesce(target_publication,0) > 0 then
    if target_action <> 'read' or coalesce(target_procedure,0) > 0 then raise exception 'PDF en lecture seule' using errcode = '42501'; end if;
    select * into publication from public.published_procedures where id = target_publication and (status = 'published' or (status='draft' and published_by=auth.uid()
        and public.has_any_role(array['admin','direction'])))
      and google_drive_path is not null and mime_type = 'application/pdf';
    if not found then raise exception 'Publication inaccessible' using errcode = '42501'; end if;
    return jsonb_build_object('directory','Procedures PDF','path',publication.google_drive_path,'sha256',publication.drive_sha256,'bytes',publication.size_bytes);
  end if;
  if not public.has_any_role(array['admin','direction']) then raise exception 'Source reservee a Administration et Direction' using errcode = '42501'; end if;
  if target_action = 'write' and coalesce(target_procedure,0) = 0 then return jsonb_build_object('directory','Procedures'); end if;
  if target_action not in ('read','open','publish') then raise exception 'Operation non autorisee' using errcode = '42501'; end if;
  select * into source from public.procedures where id = target_procedure and source_google_drive_path is not null;
  if not found then raise exception 'Importez la source dans le dossier Procedures avant cette action' using errcode = '42501'; end if;
  return jsonb_build_object('directory','Procedures','path',source.source_google_drive_path,'pdfName',public.procedure_drive_pdf_name(source));
end;
$function$;


-- Metadata adapter for existing business validators. This returns typed rows
-- only; it never inserts fake objects into Storage, exposes credentials or reads
-- bytes. Existing guards, paths, owner/MIME/size checks and locking remain intact.
create function document_blob_private.objects()
returns setof storage.objects language sql stable security invoker set search_path='' as $$
  select o.* from storage.objects o
    where not exists(select 1 from public.document_blob_files b
      where b.source_bucket=o.bucket_id and b.source_path=o.name)
  union all
  select (jsonb_populate_record(null::storage.objects,jsonb_build_object(
    'id',b.id,'bucket_id',b.source_bucket,'name',b.source_path,'owner_id',b.original_owner_id,
    'created_at',b.created_at,'updated_at',b.verified_at,
    'metadata',jsonb_build_object('mimetype',b.mime_type,'size',b.bytes,'sha256',b.sha256,
      'source_sha256',b.source_sha256,'document_blob_verified',true)))).*
  from public.document_blob_files b where b.active;
$$;
revoke all on function document_blob_private.objects() from public,anon;
grant execute on function document_blob_private.objects() to authenticated,service_role;

create function public.document_blob_lookup_batch(target_bucket text,target_paths text[])
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Connexion SeaPilot requise.' using errcode='42501'; end if;
  if target_paths is null or cardinality(target_paths)>200
    or exists(select 1 from unnest(target_paths) path where path is null or length(path) not between 1 and 2000) then
    raise exception 'Lot de documents invalide (maximum 200).' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('path',requested.path,
    'document',case when d.id is null then null else jsonb_build_object(
      'id',d.id,'provider',d.provider,'blob_pathname',d.blob_pathname,'blob_url',d.blob_url,
      'file_name',d.file_name,'mime_type',d.mime_type,'bytes',d.bytes,'sha256',d.sha256,
      'source_sha256',d.source_sha256,'verified_at',d.verified_at) end,
    'error',case when d.id is null and document_blob_private.has_mapping(target_bucket,requested.path)
      then '42501' else null end) order by requested.ordinality),'[]'::jsonb)
  into result from unnest(target_paths) with ordinality requested(path,ordinality)
    left join public.document_blob_files d on d.source_bucket=target_bucket and d.source_path=requested.path and d.active;
  return result;
end;
$$;
revoke all on function public.document_blob_lookup_batch(text,text[]) from public,anon;
grant execute on function public.document_blob_lookup_batch(text,text[]) to authenticated,service_role;

-- Preserve the existing application_branding_private.save_logo guards and workflow.
CREATE OR REPLACE FUNCTION application_branding_private.save_logo(p_logo_path text, p_expected_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target application_branding_private.settings; object_row storage.objects; expected_mime text;
begin
  if not application_branding_private.can_manage() then
    raise exception 'APPLICATION_BRANDING_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if p_logo_path is not null then
    if p_logo_path !~ ('^logos/' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|webp)$') then
      raise exception 'APPLICATION_BRANDING_INVALID_LOGO' using errcode = '22023';
    end if;
    expected_mime := case split_part(p_logo_path, '.', 2) when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'webp' then 'image/webp' end;
    select * into object_row from document_blob_private.objects() where bucket_id = 'application-branding' and name = p_logo_path for share;
    if object_row.id is null or object_row.owner_id is distinct from auth.uid()::text
      or object_row.metadata->>'mimetype' is distinct from expected_mime
      or not (case when coalesce(object_row.metadata->>'size', '') ~ '^[0-9]{1,10}$'
        then (object_row.metadata->>'size')::bigint between 1 and 2097152 else false end) then
      raise exception 'APPLICATION_BRANDING_INVALID_LOGO' using errcode = '22023';
    end if;
  end if;
  select * into target from application_branding_private.settings where singleton for update;
  if p_expected_revision is null or target.revision is distinct from p_expected_revision then
    raise exception 'APPLICATION_BRANDING_REVISION_CHANGED' using errcode = '40001';
  end if;
  update application_branding_private.settings set logo_path = p_logo_path,
    revision = revision + 1, updated_by = auth.uid(), updated_at = clock_timestamp() where singleton;
  return public.get_application_branding();
end $function$;


-- Preserve the existing documentary_audit_private.validate_file_refs guards and workflow.
CREATE OR REPLACE FUNCTION documentary_audit_private.validate_file_refs(p_files jsonb, p_company_id bigint, p_audit_id uuid, p_record_id uuid, p_kind text, p_existing jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare file jsonb; normalized jsonb; result jsonb:='[]'::jsonb; existing jsonb; object storage.objects;
  path text; extension text; paths text[]:='{}'; ids uuid[]:='{}'; new_count integer:=0; byte_limit bigint;
begin
  if (select auth.uid()) is null then raise exception 'Authentification requise.' using errcode='42501'; end if;
  if p_files is null or jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files)>100 then raise exception 'La liste de fichiers est invalide.' using errcode='22023'; end if;
  for file in select value from jsonb_array_elements(p_files) loop
    if jsonb_typeof(file) is distinct from 'object' or jsonb_typeof(file->'id') is distinct from 'string'
      or jsonb_typeof(file->'fileName') is distinct from 'string' or length(btrim(file->>'fileName')) not between 1 and 255
      or jsonb_typeof(file->'storagePath') is distinct from 'string' or jsonb_typeof(file->'mimeType') is distinct from 'string'
      or jsonb_typeof(file->'sizeBytes') is distinct from 'number' or (file->>'sizeBytes')::numeric not between 1 and 26214400
      or (file->>'sizeBytes')::numeric<>trunc((file->>'sizeBytes')::numeric) then raise exception 'Métadonnées de fichier invalides.' using errcode='22023'; end if;
    perform (file->>'id')::uuid;
    if (file->>'id')::uuid=any(ids) then raise exception 'Chaque fichier doit avoir un identifiant unique.' using errcode='22023'; end if;
    ids:=array_append(ids,(file->>'id')::uuid);
    extension:=documentary_audit_private.file_extension(file->>'mimeType');
    byte_limit:=case when file->>'mimeType' like 'image/%' then 10485760 else 26214400 end;
    if extension is null or (file->>'sizeBytes')::bigint>byte_limit then raise exception 'Format ou taille de fichier non autorisé.' using errcode='22023'; end if;
    path:=file->>'storagePath';
    if path=any(paths) then raise exception 'Un fichier ne peut pas être ajouté plusieurs fois.' using errcode='22023'; end if;
    paths:=array_append(paths,path);
    normalized:=jsonb_build_object('id',file->>'id','fileName',btrim(file->>'fileName'),'storagePath',path,'mimeType',file->>'mimeType','sizeBytes',(file->>'sizeBytes')::bigint);
    select value into existing from jsonb_array_elements(p_existing) where value->>'storagePath'=path;
    if existing is not null then
      if normalized<>existing then raise exception 'Un fichier enregistré ne peut pas être remplacé.' using errcode='22023'; end if;
    else
      new_count:=new_count+1;
      if new_count>10 or path<>p_company_id::text||'/'||p_audit_id::text||'/'||p_record_id::text||'/'||p_kind||'/'||(select auth.uid())::text||'/'||(file->>'id')||'.'||extension then
        raise exception 'Le chemin ou le nombre de fichiers est invalide pour cet enregistrement.' using errcode='22023'; end if;
      if not documentary_audit_private.can_upload_file(path) or documentary_audit_private.file_is_linked(path) then raise exception 'Le fichier est inaccessible ou déjà utilisé.' using errcode='42501'; end if;
      select * into object from document_blob_private.objects() where bucket_id='documentary-audit-files' and name=path and owner_id=(select auth.uid())::text;
      if object.id is null or object.metadata->>'mimetype' is distinct from file->>'mimeType'
        or (object.metadata->>'size')::bigint is distinct from (file->>'sizeBytes')::bigint then raise exception 'Le fichier téléversé est absent ou invalide.' using errcode='22023'; end if;
    end if;
    result:=result||jsonb_build_array(normalized);
  end loop;
  if exists(select 1 from jsonb_array_elements(p_existing) old_file where not(old_file->>'storagePath'=any(paths))) then
    raise exception 'Les fichiers déjà enregistrés doivent être conservés.' using errcode='22023'; end if;
  return result;
end;
$function$;


-- Preserve the existing internal_audit_private.validate_photo_refs guards and workflow.
CREATE OR REPLACE FUNCTION internal_audit_private.validate_photo_refs(p_photos jsonb, p_company_id bigint, p_audit_id uuid, p_finding_id uuid, p_kind text, p_existing jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare photo jsonb; normalized jsonb; result jsonb := '[]'::jsonb; existing jsonb;
  object storage.objects; path text; extension text; paths text[] := '{}'; ids uuid[] := '{}'; new_count integer := 0;
begin
  if (select auth.uid()) is null then raise exception 'Authentification requise.' using errcode = '42501'; end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' or jsonb_array_length(p_photos) > (case when p_kind='finding' then 100 else 10 end) then
    raise exception 'La liste de photos est invalide.' using errcode = '22023';
  end if;
  for photo in select value from jsonb_array_elements(p_photos) loop
    if jsonb_typeof(photo) is distinct from 'object' or jsonb_typeof(photo->'id') is distinct from 'string'
      or jsonb_typeof(photo->'fileName') is distinct from 'string' or length(btrim(photo->>'fileName')) not between 1 and 255
      or jsonb_typeof(photo->'storagePath') is distinct from 'string' or jsonb_typeof(photo->'mimeType') is distinct from 'string'
      or jsonb_typeof(photo->'sizeBytes') is distinct from 'number' or (photo->>'sizeBytes')::numeric not between 1 and 10485760
      or (photo->>'sizeBytes')::numeric <> trunc((photo->>'sizeBytes')::numeric) then
      raise exception 'Métadonnées de photo invalides.' using errcode = '22023';
    end if;
    perform (photo->>'id')::uuid;
    if (photo->>'id')::uuid=any(ids) then raise exception 'Chaque photo doit avoir un identifiant unique.' using errcode='22023'; end if;
    ids:=array_append(ids,(photo->>'id')::uuid);
    extension := case photo->>'mimeType' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else null end;
    if extension is null then raise exception 'Seules les photos JPEG, PNG et WebP sont acceptées.' using errcode = '22023'; end if;
    path := photo->>'storagePath';
    if path = any(paths) then raise exception 'Une photo ne peut pas être ajoutée plusieurs fois.' using errcode = '22023'; end if;
    paths := array_append(paths,path);
    normalized := jsonb_build_object('id',photo->>'id','fileName',btrim(photo->>'fileName'),'storagePath',path,'mimeType',photo->>'mimeType','sizeBytes',(photo->>'sizeBytes')::bigint);
    select value into existing from jsonb_array_elements(p_existing) where value->>'storagePath'=path;
    if existing is not null then
      if normalized <> existing then raise exception 'Une photo enregistrée ne peut pas être remplacée.' using errcode = '22023'; end if;
    else
      new_count := new_count+1;
      if new_count > 10 or path <> p_company_id::text||'/'||p_audit_id::text||'/'||p_finding_id::text||'/'||p_kind||'/'||(select auth.uid())::text||'/'||(photo->>'id')||'.'||extension then
        raise exception 'Le chemin de la photo est invalide pour cet écart.' using errcode = '22023';
      end if;
      if not internal_audit_private.can_upload_photo(path) or internal_audit_private.photo_is_linked(path) then raise exception 'La photo est inaccessible ou déjà utilisée.' using errcode = '42501'; end if;
      select * into object from document_blob_private.objects() where bucket_id='internal-audit-photos' and name=path and owner_id=(select auth.uid())::text;
      if object.id is null or object.metadata->>'mimetype' is distinct from photo->>'mimeType'
        or (object.metadata->>'size')::bigint is distinct from (photo->>'sizeBytes')::bigint then
        raise exception 'La photo téléversée est absente ou invalide.' using errcode = '22023';
      end if;
    end if;
    result := result || jsonb_build_array(normalized);
  end loop;
  if exists(select 1 from jsonb_array_elements(p_existing) old_photo where not (old_photo->>'storagePath'=any(paths))) then
    raise exception 'Les photos déjà enregistrées doivent être conservées.' using errcode = '22023';
  end if;
  return result;
end;
$function$;


-- Preserve the existing public.action_item_add_treatment_followup guards and workflow.
CREATE OR REPLACE FUNCTION public.action_item_add_treatment_followup(p_action_id bigint, p_note text DEFAULT NULL::text, p_attachment_file_name text DEFAULT NULL::text, p_attachment_storage_path text DEFAULT NULL::text, p_attachment_mime_type text DEFAULT NULL::text, p_attachment_size_bytes bigint DEFAULT NULL::bigint, p_close_action boolean DEFAULT false)
 RETURNS action_item_treatment_events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.action_items;
  created_event public.action_item_treatment_events;
  actor_person_id bigint := public.current_person_id();
  actor_name text;
  actor_signature jsonb;
  signature_version_id bigint;
  normalized_note text := nullif(btrim(p_note), '');
  normalized_file_name text := nullif(btrim(p_attachment_file_name), '');
  normalized_storage_path text := nullif(btrim(p_attachment_storage_path), '');
  normalized_mime_type text := nullif(btrim(p_attachment_mime_type), '');
  has_attachment boolean;
  management_closure boolean;
  event_kind text;
begin
  if (select auth.uid()) is null then
    raise exception 'Vous ne pouvez pas commenter cette action.' using errcode = '42501';
  end if;

  select action.* into target
  from public.action_items action
  where action.id = p_action_id and action.company_id = public.current_planning_company_id()
  for update;
  if target.id is null or not private.action_item_can_read_before_vessel_window(target.id) then
    raise exception 'Action introuvable ou inaccessible.' using errcode = '42501';
  end if;
  if target.closed_on is not null or target.workflow_status = 'closed' then
    raise exception 'Une action soldée ne peut plus être modifiée.' using errcode = '55000';
  end if;

  has_attachment := normalized_storage_path is not null
    or normalized_file_name is not null or normalized_mime_type is not null
    or p_attachment_size_bytes is not null;
  if normalized_note is null and not has_attachment and not coalesce(p_close_action, false) then
    raise exception 'Ajoutez un commentaire, une pièce jointe ou demandez la clôture.' using errcode = '22023';
  end if;
  if normalized_note is not null and length(normalized_note) > 5000 then
    raise exception 'Le commentaire de suivi est limité à 5 000 caractères.' using errcode = '22023';
  end if;
  if coalesce(p_close_action, false) and target.workflow_status <> 'approved' then
    raise exception 'La clôture ne peut être demandée qu''après approbation.' using errcode = '55000';
  end if;
  if coalesce(p_close_action, false) and target.closure_review_status = 'pending' then
    raise exception 'Une demande de clôture est déjà en attente de contre-validation.' using errcode = '55000';
  end if;

  if has_attachment then
    if normalized_file_name is null or length(normalized_file_name) > 255
      or normalized_mime_type is null or length(normalized_mime_type) > 180
      or p_attachment_size_bytes not between 1 and 10485760
      or normalized_storage_path is null
      or normalized_storage_path not like target.company_id::text || '/' || target.id::text || '/suivi-%'
      or not exists (
        select 1 from document_blob_private.objects() object
        where object.bucket_id = 'action-plan-evidence' and object.name = normalized_storage_path
          and (object.metadata->>'document_blob_verified' is distinct from 'true'
            or (object.metadata->>'mimetype'=normalized_mime_type
              and (object.metadata->>'size')::bigint=p_attachment_size_bytes))
      ) then
      raise exception 'La pièce jointe du suivi est invalide.' using errcode = '22023';
    end if;
  end if;

  select coalesce(
    nullif(btrim(concat_ws(' ', person.first_name, upper(person.last_name))), ''),
    nullif(btrim(profile.display_name), ''), profile.email, 'Utilisateur SeaPilot'
  ) into actor_name
  from public.profiles profile
  left join public.people person
    on person.user_id = profile.id and person.company_id = target.company_id and person.active
  where profile.id = (select auth.uid())
  order by person.id limit 1;
  actor_name := coalesce(actor_name, 'Utilisateur SeaPilot');

  actor_signature := public.working_time_active_signature_snapshot(target.company_id, actor_person_id);
  if actor_person_id is null or actor_signature = '{}'::jsonb then
    raise exception 'Une signature active doit être enregistrée dans le dossier RH avant de continuer.' using errcode = '55000';
  end if;
  signature_version_id := (actor_signature->>'signature_id')::bigint;
  management_closure := coalesce(p_close_action, false)
    and public.has_company_role(target.company_id, array['admin', 'direction']);
  event_kind := case
    when management_closure then 'closure_approved'
    when coalesce(p_close_action, false) then 'closure_requested'
    when has_attachment then 'attachment_added'
    else 'commented'
  end;

  insert into public.action_item_treatment_events (
    company_id, action_item_id, event_type, note,
    attachment_file_name, attachment_storage_bucket, attachment_storage_path,
    attachment_mime_type, attachment_size_bytes,
    created_by_profile_id, created_by_person_id, created_by_name,
    signature_version_id, signature_snapshot
  ) values (
    target.company_id, target.id, event_kind,
    coalesce(normalized_note, case event_kind
      when 'closure_requested' then 'Clôture demandée.'
      when 'closure_approved' then 'Clôture validée.'
      else null end),
    case when has_attachment then normalized_file_name end,
    case when has_attachment then 'action-plan-evidence' end,
    case when has_attachment then normalized_storage_path end,
    case when has_attachment then normalized_mime_type end,
    case when has_attachment then p_attachment_size_bytes end,
    (select auth.uid()), actor_person_id, actor_name,
    signature_version_id, actor_signature
  ) returning * into created_event;

  if management_closure then
    update public.action_items action
    set status = 'Ecart Soldé', closed_on = (clock_timestamp() at time zone 'Europe/Paris')::date,
        workflow_status = 'closed', closure_review_status = 'none',
        closure_requested_by_profile_id = null, closure_requested_by_person_id = null,
        closure_requested_by_name = null, closure_requested_at = null,
        updated_at = clock_timestamp()
    where action.id = target.id;
    perform public.action_item_notify_closure(
      target.id, 'action_closure_approved', 'Clôture validée',
      actor_name || ' a clôturé la fiche « ' || target.title || ' ».',
      'action-close-approved-' || target.id || '-' || created_event.id, false
    );
  elsif coalesce(p_close_action, false) then
    update public.action_items action
    set closure_review_status = 'pending',
        closure_requested_by_profile_id = (select auth.uid()),
        closure_requested_by_person_id = actor_person_id,
        closure_requested_by_name = actor_name,
        closure_requested_at = created_event.created_at,
        updated_at = clock_timestamp()
    where action.id = target.id;
    perform public.action_item_notify_closure(
      target.id, 'action_closure_requested', 'Clôture à contre-valider',
      actor_name || ' demande la clôture de la fiche « ' || target.title || ' ».',
      'action-close-requested-' || target.id || '-' || created_event.id, true
    );
  end if;

  return created_event;
end;
$function$;


-- Preserve the existing public.add_lifting_item_certificate guards and workflow.
CREATE OR REPLACE FUNCTION public.add_lifting_item_certificate(p_item_id bigint, p_storage_path text, p_file_name text, p_mime_type text, p_file_size bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result uuid; i public.lifting_inventory%rowtype;
begin
  if p_item_id is null or not coalesce(public.lifting_certificate_path_access(p_storage_path),false) or split_part(p_storage_path,'/',3)<>p_item_id::text then raise exception using errcode='42501',message='Accès refusé au certificat de ce matériel.'; end if;
  select * into i from public.lifting_inventory where id=p_item_id for update;
  if p_storage_path !~ ('^'||i.company_id||'/'||i.vessel_id||'/'||i.id||'/'||i.service_version||'/[0-9a-f-]+[.](pdf|jpg|png)$') then
    raise exception 'Ce matériel a été remplacé. Rechargez sa fiche avant d’ajouter un certificat.'; end if;
  if nullif(btrim(p_file_name),'') is null or length(p_file_name)>255 or p_mime_type not in ('application/pdf','image/jpeg','image/png') or p_file_size is null or p_file_size<=0 or p_file_size>20971520
    or not exists(select 1 from document_blob_private.objects() where bucket_id='lifting-certificates' and name=p_storage_path and metadata->>'mimetype'=p_mime_type and (metadata->>'size')::bigint=p_file_size)
    then raise exception 'Joignez un PDF, JPG ou PNG de 20 Mo maximum.'; end if;
  insert into public.lifting_item_certificates(item_id,service_version,storage_path,file_name,mime_type,file_size,created_by)
    values(p_item_id,i.service_version,p_storage_path,btrim(p_file_name),p_mime_type,p_file_size,auth.uid())
    on conflict(storage_path) do nothing returning id into result;
  if result is null then select id into result from public.lifting_item_certificates where storage_path=p_storage_path and item_id=p_item_id; end if;
  return result;
end $function$;


-- Preserve the existing public.annual_review_sign_and_archive guards and workflow.
CREATE OR REPLACE FUNCTION public.annual_review_sign_and_archive(p_review_id bigint, p_storage_path text, p_file_name text, p_file_size_bytes bigint, p_sha256 text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_review public.annual_reviews%rowtype;
declare signature_data jsonb;
declare identity_data jsonb;
declare created_document_id bigint;
begin
  select * into target_review from public.annual_reviews review where review.id = p_review_id for update;
  if target_review.id is null or target_review.company_id <> public.current_planning_company_id()
    or target_review.employee_person_id <> public.current_person_id()
    or target_review.status <> 'awaiting_signature'
    or p_storage_path !~ ('^' || target_review.company_id || '/' || target_review.id || '/final/[^/]+\.pdf$')
    or p_file_name !~* '\.pdf$' or position(target_review.review_year::text in p_file_name) = 0
    or p_file_size_bytes not between 1 and 10485760 or p_sha256 !~ '^[0-9a-f]{64}$'
    or not exists (
      select 1 from document_blob_private.objects() object
      where object.bucket_id = 'annual-review-reports' and object.name = p_storage_path
        and (object.metadata->>'document_blob_verified' is distinct from 'true'
          or (object.metadata->>'sha256'=lower(p_sha256) and (object.metadata->>'size')::bigint=p_file_size_bytes))
    ) then
    raise exception using errcode = '42501', message = 'ANNUAL_REVIEW_SIGNATURE_FORBIDDEN.';
  end if;

  signature_data := public.working_time_active_signature_snapshot(target_review.company_id, target_review.employee_person_id);
  if signature_data = '{}'::jsonb then
    raise exception using errcode = '23514', message = 'ANNUAL_REVIEW_COLLABORATOR_SIGNATURE_REQUIRED.';
  end if;
  select jsonb_build_object(
    'person_id', person.id, 'user_id', person.user_id,
    'first_name', person.first_name, 'last_name', person.last_name,
    'display_name', trim(person.first_name || ' ' || upper(person.last_name)),
    'signed_at', now()
  ) into identity_data from public.people person where person.id = target_review.employee_person_id;

  insert into public.hr_documents (
    company_id, person_id, category_key, title, status, issued_on, expires_on,
    source_label, notes, storage_bucket, storage_path, file_size_bytes, mime_type
  ) values (
    target_review.company_id, target_review.employee_person_id, 'annual_review', p_file_name,
    case when target_review.due_on <= current_date + 90 then 'renew_due' else 'valid' end,
    (target_review.starts_at at time zone 'Europe/Paris')::date, target_review.due_on, 'annual_review',
    'Rapport signe par le management et le collaborateur.',
    'annual-review-reports', p_storage_path, p_file_size_bytes, 'application/pdf'
  ) returning id into created_document_id;

  update public.annual_reviews
  set status = 'archived', collaborator_signed_at = now(), archived_at = now(),
    collaborator_identity_snapshot = identity_data, collaborator_signature_snapshot = signature_data,
    final_report_bucket = 'annual-review-reports', final_report_path = p_storage_path,
    final_report_file_name = p_file_name, final_report_size_bytes = p_file_size_bytes,
    final_report_sha256 = lower(p_sha256), hr_document_id = created_document_id
  where id = target_review.id;
  insert into public.annual_review_events (company_id, review_id, event_type, actor_person_id, payload)
  values (target_review.company_id, target_review.id, 'collaborator_signed_and_archived',
    public.current_person_id(), jsonb_build_object('hr_document_id', created_document_id, 'due_on', target_review.due_on));
  return created_document_id;
end;
$function$;


-- Preserve the existing public.annual_review_validate_manager_report guards and workflow.
CREATE OR REPLACE FUNCTION public.annual_review_validate_manager_report(p_review_id bigint, p_storage_path text, p_file_name text, p_file_size_bytes bigint, p_sha256 text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target_review public.annual_reviews%rowtype;
declare signature_data jsonb;
declare identity_data jsonb;
begin
  select * into target_review from public.annual_reviews review where review.id = p_review_id for update;
  if target_review.id is null or target_review.company_id <> public.current_planning_company_id()
    or target_review.manager_person_id <> public.current_person_id()
    or target_review.status <> 'collaborator_submitted'
    or p_storage_path !~ ('^' || target_review.company_id || '/' || target_review.id || '/manager/[^/]+\.pdf$')
    or p_file_name !~* '\.pdf$' or p_file_size_bytes not between 1 and 10485760
    or p_sha256 !~ '^[0-9a-f]{64}$'
    or not exists (
      select 1 from document_blob_private.objects() object
      where object.bucket_id = 'annual-review-reports' and object.name = p_storage_path
        and (object.metadata->>'document_blob_verified' is distinct from 'true'
          or (object.metadata->>'sha256'=lower(p_sha256) and (object.metadata->>'size')::bigint=p_file_size_bytes))
    )
    or not exists (
      select 1 from public.annual_review_responses response
      where response.review_id = target_review.id and response.respondent_role = 'manager'
        and public.annual_review_answers_complete(response.answers)
    ) then
    raise exception using errcode = '42501', message = 'ANNUAL_REVIEW_MANAGER_VALIDATION_FORBIDDEN.';
  end if;

  signature_data := public.working_time_active_signature_snapshot(target_review.company_id, target_review.manager_person_id);
  if signature_data = '{}'::jsonb then
    raise exception using errcode = '23514', message = 'ANNUAL_REVIEW_MANAGER_SIGNATURE_REQUIRED.';
  end if;
  select jsonb_build_object(
    'person_id', person.id, 'user_id', person.user_id,
    'first_name', person.first_name, 'last_name', person.last_name,
    'display_name', trim(person.first_name || ' ' || upper(person.last_name)),
    'validated_at', now()
  ) into identity_data from public.people person where person.id = target_review.manager_person_id;

  update public.annual_reviews
  set status = 'awaiting_signature', manager_validated_at = now(),
    manager_identity_snapshot = identity_data, manager_signature_snapshot = signature_data,
    manager_report_bucket = 'annual-review-reports', manager_report_path = p_storage_path,
    manager_report_file_name = p_file_name, manager_report_size_bytes = p_file_size_bytes,
    manager_report_sha256 = lower(p_sha256)
  where id = target_review.id;
  insert into public.annual_review_events (company_id, review_id, event_type, actor_person_id)
  values (target_review.company_id, target_review.id, 'manager_validated', public.current_person_id());
  return target_review.id;
end;
$function$;


-- Preserve the existing public.clients_save guards and workflow.
CREATE OR REPLACE FUNCTION public.clients_save(target_client_id bigint DEFAULT NULL::bigint, target_name text DEFAULT NULL::text, target_represented_by text DEFAULT NULL::text, target_code text DEFAULT NULL::text, target_email text DEFAULT NULL::text, target_phone text DEFAULT NULL::text, target_address text DEFAULT NULL::text, target_postal_code text DEFAULT NULL::text, target_city text DEFAULT NULL::text, target_country text DEFAULT NULL::text, target_website text DEFAULT NULL::text, target_logo_url text DEFAULT NULL::text, target_logo_storage_path text DEFAULT NULL::text, target_active boolean DEFAULT true, target_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS clients
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_company_id bigint := public.current_planning_company_id();
  normalized_name text := public.normalize_import_label(target_name);
  normalized_logo_path text := nullif(trim(target_logo_storage_path), '');
  result public.clients;
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Insufficient permission to save a client' using errcode = '42501';
  end if;
  if normalized_name is null then
    raise exception 'Client name is required' using errcode = '22023';
  end if;
  if normalized_logo_path is not null and (
    target_client_id is null
    or normalized_logo_path !~ ('^clients/' || target_client_id::text || '/[^/]+$')
    or not exists (
      select 1 from document_blob_private.objects() object
      where object.bucket_id = 'project-catalog-media'
        and object.name = normalized_logo_path
    )
  ) then
    raise exception 'Invalid client logo storage path' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('client:' || target_company_id::text || ':' || normalized_name, 0)
  );

  if exists (
    select 1
    from public.clients client
    where client.company_id = target_company_id
      and client.id is distinct from target_client_id
      and client.archived_at is null
      and public.normalize_import_label(client.name) = normalized_name
  ) then
    raise exception 'An active client with this name already exists' using errcode = '23505';
  end if;

  if target_client_id is null then
    insert into public.clients (
      company_id,
      name,
      represented_by,
      code,
      email,
      phone,
      address,
      postal_code,
      city,
      country,
      website,
      logo_url,
      active,
      source_label,
      created_by,
      updated_by
    ) values (
      target_company_id,
      trim(target_name),
      nullif(trim(target_represented_by), ''),
      nullif(trim(target_code), ''),
      nullif(trim(target_email), ''),
      nullif(trim(target_phone), ''),
      nullif(trim(target_address), ''),
      nullif(trim(target_postal_code), ''),
      nullif(trim(target_city), ''),
      nullif(trim(target_country), ''),
      nullif(trim(target_website), ''),
      nullif(trim(target_logo_url), ''),
      coalesce(target_active, true),
      'seapilot',
      auth.uid(),
      auth.uid()
    )
    returning * into result;
  else
    update public.clients client
    set name = trim(target_name),
        represented_by = nullif(trim(target_represented_by), ''),
        code = nullif(trim(target_code), ''),
        email = nullif(trim(target_email), ''),
        phone = nullif(trim(target_phone), ''),
        address = nullif(trim(target_address), ''),
        postal_code = nullif(trim(target_postal_code), ''),
        city = nullif(trim(target_city), ''),
        country = nullif(trim(target_country), ''),
        website = nullif(trim(target_website), ''),
        logo_url = nullif(trim(target_logo_url), ''),
        logo_storage_path = normalized_logo_path,
        active = coalesce(target_active, true),
        updated_by = auth.uid()
    where client.id = target_client_id
      and client.company_id = target_company_id
      and client.archived_at is null
      and (target_expected_updated_at is null or client.updated_at = target_expected_updated_at)
    returning * into result;

    if result.id is null then
      if exists (
        select 1
        from public.clients client
        where client.id = target_client_id
          and client.company_id = target_company_id
          and client.archived_at is null
      ) then
        raise exception 'Client was modified by another user' using errcode = '40001';
      end if;
      raise exception 'Active client not found in the active company' using errcode = 'P0002';
    end if;
  end if;

  return result;
end;
$function$;


-- Preserve the existing public.dpr_complete_file_upload guards and workflow.
CREATE OR REPLACE FUNCTION public.dpr_complete_file_upload(target_file_id bigint)
 RETURNS dpr_files
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
declare
  current_file public.dpr_files;
  current_report public.dpr_reports;
begin
  select * into current_file from public.dpr_files where id = target_file_id for update;
  select * into current_report from public.dpr_reports where id = current_file.dpr_id;
  if current_file.id is null
     or current_file.status <> 'pending'
     or current_file.created_by <> auth.uid()
     or not exists (
       select 1 from document_blob_private.objects() object
       where object.bucket_id = current_file.bucket_name and object.name = current_file.object_path
     ) then
    raise exception 'The registered DPR file was not uploaded' using errcode = '23514';
  end if;
  if current_file.file_kind = 'pdf' then
    update public.dpr_files set is_current = false
    where dpr_id = current_file.dpr_id and file_kind = 'pdf' and id <> current_file.id;
  end if;
  update public.dpr_files
  set status = 'ready', ready_at = now(), is_current = (file_kind = 'pdf')
  where id = current_file.id returning * into current_file;
  insert into public.dpr_audit_events (
    company_id, dpr_id, version_no, event_type, actor_user_id, metadata
  ) values (
    current_file.company_id,
    current_file.dpr_id,
    current_report.version_no,
    case when current_file.file_kind = 'pdf' then 'pdf-generated' else 'file-registered' end,
    auth.uid(),
    jsonb_build_object('file_id', current_file.id, 'filename', current_file.display_filename, 'kind', current_file.file_kind)
  );
  return current_file;
end;
$function$;


-- Preserve the existing public.preview_working_time_import_base guards and workflow.
CREATE OR REPLACE FUNCTION public.preview_working_time_import_base(p_batch_id bigint, p_person_id bigint, p_source_year integer, p_timezone_name text, p_detected_person_name text, p_parser_version text, p_workbook_metadata jsonb, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
declare
  target_batch public.working_time_import_batches%rowtype;
  row_data jsonb;
  phase_data jsonb;
  original_phases jsonb;
  effective_phases jsonb;
  target_date date;
  source_sheet text;
  source_row integer;
  reported_seconds integer;
  effective_seconds integer;
  phase_start integer;
  phase_end integer;
  previous_end integer;
  issues text[];
  target_status text;
  target_vessel_id bigint;
  target_watch_group text;
  target_assignment_id bigint;
  source_hash text;
  was_corrected boolean;
  summary jsonb;
begin
  select * into target_batch
  from public.working_time_import_batches batch
  where batch.id = p_batch_id
  for update;
  if target_batch.id is null or not public.working_time_can_manage_imports(target_batch.company_id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_IMPORT_PERMISSION_DENIED.';
  end if;
  if target_batch.status not in ('awaiting_upload', 'preview_ready') then
    raise exception using errcode = '55000', message = 'WORKING_TIME_IMPORT_BATCH_LOCKED.';
  end if;
  if exists (
    select 1 from public.document_drive_files drive
    where drive.source_bucket = target_batch.source_storage_bucket
      and drive.source_path = target_batch.source_storage_path and not drive.active
  ) or (not exists (
    select 1 from document_blob_private.objects() object
    where object.bucket_id = target_batch.source_storage_bucket
      and object.name = target_batch.source_storage_path
      and (coalesce((object.metadata->>'document_blob_verified')::boolean,false)=false
        or (object.metadata->>'source_sha256'=target_batch.source_sha256
          and lower(object.metadata->>'mimetype')=lower(target_batch.source_mime_type)))
  ) and not exists (
    select 1 from public.document_drive_files drive
    where drive.source_bucket = target_batch.source_storage_bucket
      and drive.source_path = target_batch.source_storage_path
      and drive.active and drive.verified_at is not null
      and drive.source_sha256 = target_batch.source_sha256
      and lower(drive.mime_type) = lower(target_batch.source_mime_type)
  )) then
    raise exception using errcode = '55000', message = 'WORKING_TIME_IMPORT_SOURCE_NOT_UPLOADED.';
  end if;
  if p_source_year not between 2000 and 2200 then
    raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_YEAR_INVALID.';
  end if;
  if not exists (select 1 from pg_timezone_names zone where zone.name = p_timezone_name) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_TIMEZONE_INVALID.';
  end if;
  if not exists (
    select 1 from public.people person
    where person.id = p_person_id and person.company_id = target_batch.company_id and person.active
  ) then
    raise exception using errcode = '23503', message = 'WORKING_TIME_IMPORT_PERSON_NOT_FOUND.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_ROWS_INVALID.';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 366 then
    raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_ROWS_INVALID.';
  end if;
  if (select count(*) from jsonb_array_elements(p_rows)) <>
     (select count(distinct (item->>'date')) from jsonb_array_elements(p_rows) item) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_DUPLICATE_SOURCE_DATES.';
  end if;

  delete from public.working_time_import_rows where batch_id = target_batch.id;

  for row_data in select value from jsonb_array_elements(p_rows) loop
    issues := '{}'::text[];
    source_sheet := left(trim(coalesce(row_data->>'sheet', '')), 120);
    begin
      source_row := (row_data->>'row')::integer;
      target_date := (row_data->>'date')::date;
      reported_seconds := nullif(row_data->>'reported_work_seconds', '')::integer;
    exception when others then
      raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_ROW_FORMAT_INVALID.';
    end;
    if source_sheet = '' or source_row not between 1 and 1000
      or extract(year from target_date)::integer <> p_source_year then
      raise exception using errcode = '22023', message = 'WORKING_TIME_IMPORT_ROW_DATE_INVALID.';
    end if;

    original_phases := coalesce(row_data->'detected_phases', '[]'::jsonb);
    effective_phases := coalesce(row_data->'phases', original_phases);
    if jsonb_typeof(original_phases) <> 'array' or jsonb_typeof(effective_phases) <> 'array' then
      issues := array_append(issues, 'invalid_phases');
      original_phases := '[]'::jsonb;
      effective_phases := '[]'::jsonb;
    elsif jsonb_array_length(original_phases) > 48 or jsonb_array_length(effective_phases) > 48 then
      issues := array_append(issues, 'invalid_phases');
      effective_phases := '[]'::jsonb;
    end if;

    effective_seconds := 0;
    previous_end := null;
    begin
      for phase_data in
        select value from jsonb_array_elements(effective_phases)
        order by (value->>'start_minute')::integer, (value->>'end_minute')::integer
      loop
        phase_start := (phase_data->>'start_minute')::integer;
        phase_end := (phase_data->>'end_minute')::integer;
        if phase_start < 0 or phase_end > 1440 or phase_end <= phase_start
          or phase_start % 30 <> 0 or phase_end % 30 <> 0
          or (previous_end is not null and phase_start < previous_end) then
          issues := array_append(issues, 'invalid_phases');
        end if;
        effective_seconds := effective_seconds + greatest(0, phase_end - phase_start) * 60;
        previous_end := greatest(coalesce(previous_end, 0), phase_end);
      end loop;
    exception when others then
      issues := array_append(issues, 'invalid_phases');
      effective_seconds := 0;
    end;
    issues := array(select distinct issue from unnest(issues) issue order by issue);

    if reported_seconds is not null and reported_seconds <> effective_seconds then
      issues := array_append(issues, 'total_mismatch');
    end if;
    if effective_seconds = 0 and coalesce(reported_seconds, 0) > 0 then
      issues := array_append(issues, 'missing_phases');
    end if;

    select vessel.id into target_vessel_id
    from public.vessels vessel
    where vessel.company_id = target_batch.company_id
      and (
        (nullif(trim(row_data->>'imo_number'), '') is not null and vessel.imo_number = trim(row_data->>'imo_number'))
        or lower(trim(vessel.name)) = lower(trim(coalesce(row_data->>'vessel_name', '')))
      )
    order by case when vessel.imo_number = trim(row_data->>'imo_number') then 0 else 1 end, vessel.id
    limit 1;

    select assignment.id, assignment.vessel_id, nullif(trim(assignment.watch_group), '')
    into target_assignment_id, target_vessel_id, target_watch_group
    from public.planning_assignments assignment
    where assignment.company_id = target_batch.company_id
      and (assignment.crew_person_id = p_person_id or assignment.captain_person_id = p_person_id)
      and target_date between assignment.starts_on and assignment.ends_on
      and assignment.confirmation_status <> 'cancelled'
      and (target_vessel_id is null or assignment.vessel_id = target_vessel_id)
      and exists (
        select 1 from public.planning_publications publication
        where publication.published_at is not null
          and publication.current_version > 0
          and target_date between publication.starts_on and publication.ends_on
          and (publication.vessel_id is null or publication.vessel_id = assignment.vessel_id)
      )
    order by assignment.starts_on desc, assignment.id desc
    limit 1;

    was_corrected := effective_phases is distinct from original_phases
      or length(trim(coalesce(row_data->>'user_note', ''))) > 0;
    if coalesce((row_data->>'excluded')::boolean, false) then
      target_status := 'excluded';
    elsif exists (
      select 1 from public.working_time_registers register
      where register.company_id = target_batch.company_id
        and register.person_id = p_person_id
        and target_date between register.period_start and register.period_end
        and register.status = 'validated'
    ) then
      target_status := 'blocked_validated';
      issues := array_append(issues, 'validated_day');
    elsif exists (
      select 1 from public.working_time_registers register
      where register.company_id = target_batch.company_id
        and register.person_id = p_person_id
        and target_date between register.period_start and register.period_end
        and register.status in ('awaiting_sailor_signature', 'submitted')
    ) then
      target_status := 'blocked_workflow';
      issues := array_append(issues, 'register_not_editable');
    elsif exists (
      select 1 from public.working_time_intervals work_interval
      where work_interval.company_id = target_batch.company_id
        and work_interval.person_id = p_person_id
        and work_interval.local_work_date = target_date
        and work_interval.voided_at is null
    ) then
      target_status := 'duplicate';
      issues := array_append(issues, 'existing_day');
    elsif cardinality(issues) > 0 then
      target_status := 'inconsistent';
    elsif was_corrected then
      target_status := 'corrected';
    else
      target_status := 'ready';
    end if;

    source_hash := md5(target_batch.source_sha256 || ':' || source_sheet || ':' || source_row || ':' || target_date);
    insert into public.working_time_import_rows (
      company_id, batch_id, person_id, source_sheet, source_row, local_work_date,
      detected_phases, effective_phases, reported_work_seconds, effective_work_seconds,
      captain_name, vessel_name, imo_number, flag_state, source_comment,
      vessel_id, watch_group, planning_assignment_id, status, issue_codes,
      user_note, source_row_hash
    ) values (
      target_batch.company_id, target_batch.id, p_person_id, source_sheet, source_row, target_date,
      original_phases, effective_phases, reported_seconds, effective_seconds,
      nullif(trim(row_data->>'captain_name'), ''), nullif(trim(row_data->>'vessel_name'), ''),
      nullif(trim(row_data->>'imo_number'), ''), nullif(trim(row_data->>'flag_state'), ''),
      nullif(trim(row_data->>'comment'), ''), target_vessel_id, target_watch_group,
      target_assignment_id, target_status, issues, nullif(trim(row_data->>'user_note'), ''), source_hash
    );
  end loop;

  select jsonb_build_object(
    'total_rows', count(*),
    'ready_rows', count(*) filter (where status in ('ready', 'corrected')),
    'excluded_rows', count(*) filter (where status = 'excluded'),
    'duplicate_rows', count(*) filter (where status = 'duplicate'),
    'inconsistent_rows', count(*) filter (where status = 'inconsistent'),
    'blocked_rows', count(*) filter (where status in ('blocked_workflow', 'blocked_validated')),
    'reported_work_seconds', coalesce(sum(reported_work_seconds), 0),
    'effective_work_seconds', coalesce(sum(effective_work_seconds) filter (where status in ('ready', 'corrected')), 0)
  ) into summary
  from public.working_time_import_rows where batch_id = target_batch.id;

  update public.working_time_import_batches set
    detected_person_name = nullif(trim(coalesce(p_detected_person_name, '')), ''),
    selected_person_id = p_person_id,
    source_year = p_source_year,
    timezone_name = p_timezone_name,
    parser_version = left(trim(coalesce(p_parser_version, 'unknown')), 100),
    workbook_metadata = coalesce(p_workbook_metadata, '{}'::jsonb),
    preview_summary = summary,
    status = 'preview_ready',
    previewed_at = clock_timestamp()
  where id = target_batch.id;

  return jsonb_build_object(
    'batch_id', target_batch.id,
    'status', 'preview_ready',
    'summary', summary,
    'rows', (
      select coalesce(jsonb_agg(to_jsonb(import_row) order by import_row.local_work_date), '[]'::jsonb)
      from public.working_time_import_rows import_row where import_row.batch_id = target_batch.id
    )
  );
end;
$function$;


-- Preserve the existing public.projects_register_generated_storage_document guards and workflow.
CREATE OR REPLACE FUNCTION public.projects_register_generated_storage_document(target_project_id bigint, target_planning_occurrence_id bigint, target_document_type text, target_revision integer, target_bucket text, target_path text, target_file_name text, target_mime_type text, target_file_size_bytes bigint, target_sha256 text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_company_id bigint := public.current_planning_company_id();
  registered_document_id bigint;
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Insufficient permission to register generated project documents' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.projects project
    where project.id = target_project_id
      and project.company_id = target_company_id
      and project.archived_at is null
  ) then
    raise exception 'Project not found in the active company' using errcode = '22023';
  end if;

  if target_document_type not in ('offer', 'bimco_supplytime', 'towage_contract', 'bareboat_charter', 'operation_attachment')
     or target_revision < 1
     or target_bucket <> 'project-files'
     or nullif(btrim(target_path), '') is null
     or target_path not like 'projects/' || target_project_id::text || '/%'
     or nullif(btrim(target_file_name), '') is null
     or nullif(btrim(target_mime_type), '') is null
     or target_file_size_bytes <= 0
     or target_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid generated project document metadata' using errcode = '22023';
  end if;

  if target_document_type = 'operation_attachment' then
    if target_planning_occurrence_id is null or not exists (
      select 1
      from public.planning_projects occurrence
      where occurrence.id = target_planning_occurrence_id
        and occurrence.catalog_project_id = target_project_id
        and occurrence.company_id = target_company_id
    ) then
      raise exception 'Operation attachment requires an occurrence belonging to the project' using errcode = '22023';
    end if;
  end if;

  if not exists (
    select 1
    from document_blob_private.objects() object
    where object.bucket_id = target_bucket
      and object.name = target_path
      and (object.metadata->>'document_blob_verified' is distinct from 'true'
        or (object.metadata->>'sha256'=target_sha256 and object.metadata->>'mimetype'=target_mime_type
          and (object.metadata->>'size')::bigint=target_file_size_bytes))
  ) and not exists (
    select 1 from public.project_drive_files drive
    where drive.source_bucket=target_bucket and drive.source_path=target_path
      and drive.project_id=target_project_id and drive.company_id=target_company_id
      and drive.sha256=target_sha256 and drive.bytes=target_file_size_bytes
  ) then
    raise exception 'Uploaded project document was not found in Storage' using errcode = '22023';
  end if;

  insert into public.project_generated_documents (
    company_id,
    project_id,
    planning_occurrence_id,
    document_type,
    revision,
    file_name,
    mime_type,
    file_size_bytes,
    sha256,
    sharepoint_drive_id,
    sharepoint_drive_item_id,
    sharepoint_web_url,
    sharepoint_folder_path,
    storage_bucket,
    storage_path,
    created_by
  ) values (
    target_company_id,
    target_project_id,
    target_planning_occurrence_id,
    target_document_type,
    target_revision,
    btrim(target_file_name),
    btrim(target_mime_type),
    target_file_size_bytes,
    target_sha256,
    null,
    null,
    null,
    null,
    target_bucket,
    target_path,
    auth.uid()
  )
  returning id into registered_document_id;

  return registered_document_id;
end;
$function$;


-- Preserve the existing public.projects_register_storage_attachment guards and workflow.
CREATE OR REPLACE FUNCTION public.projects_register_storage_attachment(target_project_id bigint, target_bucket text, target_path text, target_file_name text, target_mime_type text, target_file_size_bytes bigint, target_sha256 text, target_category_key text, target_subcategory_key text DEFAULT NULL::text, target_expires_on date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_company_id bigint := public.current_planning_company_id();
  registered_document_id bigint;
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Insufficient permission to register project attachments' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.projects project
    where project.id = target_project_id
      and project.company_id = target_company_id
      and project.archived_at is null
  ) then
    raise exception 'Project not found in the active company' using errcode = '22023';
  end if;

  if target_bucket <> 'project-files'
     or nullif(btrim(target_path), '') is null
     or target_path not like 'projects/' || target_project_id::text || '/attachments/%'
     or nullif(btrim(target_file_name), '') is null
     or nullif(btrim(target_mime_type), '') is null
     or target_file_size_bytes <= 0
     or target_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid project attachment metadata' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.project_document_categories category
    where category.company_id = target_company_id
      and category.category_key = target_category_key
      and category.parent_key is null
      and category.active
  ) then
    raise exception 'Invalid or inactive project attachment category' using errcode = '22023';
  end if;

  if target_subcategory_key is not null and not exists (
    select 1
    from public.project_document_categories subcategory
    where subcategory.company_id = target_company_id
      and subcategory.category_key = target_subcategory_key
      and subcategory.parent_key = target_category_key
      and subcategory.active
  ) then
    raise exception 'Invalid or inactive project attachment subcategory' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from document_blob_private.objects() object
    where object.bucket_id = target_bucket
      and object.name = target_path
      and (object.metadata->>'document_blob_verified' is distinct from 'true'
        or (object.metadata->>'sha256'=target_sha256 and object.metadata->>'mimetype'=target_mime_type
          and (object.metadata->>'size')::bigint=target_file_size_bytes))
  ) and not exists (
    select 1 from public.project_drive_files drive
    where drive.source_bucket=target_bucket and drive.source_path=target_path
      and drive.project_id=target_project_id and drive.company_id=target_company_id
      and drive.sha256=target_sha256 and drive.bytes=target_file_size_bytes
  ) then
    raise exception 'Uploaded project attachment was not found in Storage' using errcode = '22023';
  end if;

  insert into public.project_generated_documents (
    company_id,
    project_id,
    planning_occurrence_id,
    document_type,
    revision,
    file_name,
    mime_type,
    file_size_bytes,
    sha256,
    sharepoint_drive_id,
    sharepoint_drive_item_id,
    sharepoint_web_url,
    sharepoint_folder_path,
    storage_bucket,
    storage_path,
    category_key,
    subcategory_key,
    expires_on,
    created_by
  ) values (
    target_company_id,
    target_project_id,
    null,
    'project_attachment',
    1,
    btrim(target_file_name),
    btrim(target_mime_type),
    target_file_size_bytes,
    target_sha256,
    null,
    null,
    null,
    null,
    target_bucket,
    target_path,
    target_category_key,
    target_subcategory_key,
    target_expires_on,
    auth.uid()
  )
  returning id into registered_document_id;

  return registered_document_id;
end;
$function$;


-- Preserve the existing public.projects_save_towed_asset guards and workflow.
CREATE OR REPLACE FUNCTION public.projects_save_towed_asset(target_towed_asset_id bigint, target_name text, target_asset_type text, target_length_overall_m numeric, target_breadth_overall_m numeric, target_max_draft_m numeric, target_light_displacement_t numeric, target_flag text, target_classification_society text, target_registration_number text, target_owner_name text, target_hull_machinery_insurer text, target_liability_insurer text, target_photo_url text, target_photo_storage_path text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_company_id bigint := public.current_planning_company_id();
  saved_id bigint;
  normalized_flag text := nullif(upper(trim(target_flag)), '');
  normalized_photo_path text := nullif(trim(target_photo_storage_path), '');
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Insufficient permission to save a towed asset' using errcode = '42501';
  end if;
  if nullif(trim(target_name), '') is null then
    raise exception 'Towed asset name is required' using errcode = '22023';
  end if;
  if normalized_flag is not null and normalized_flag !~ '^[A-Z]{2}$' then
    raise exception 'Towed asset flag must contain two letters' using errcode = '22023';
  end if;
  if target_length_overall_m < 0
     or target_breadth_overall_m < 0
     or target_max_draft_m < 0
     or target_light_displacement_t < 0 then
    raise exception 'Towed asset dimensions cannot be negative' using errcode = '22023';
  end if;
  if normalized_photo_path is not null and (
    target_towed_asset_id is null
    or normalized_photo_path !~ ('^towed-assets/' || target_towed_asset_id::text || '/[^/]+$')
    or not exists (
      select 1 from document_blob_private.objects() object
      where object.bucket_id = 'project-catalog-media'
        and object.name = normalized_photo_path
    )
  ) then
    raise exception 'Invalid towed-asset photo storage path' using errcode = '22023';
  end if;

  if target_towed_asset_id is null then
    insert into public.project_towed_assets (
      company_id,
      name,
      asset_type,
      length_overall_m,
      breadth_overall_m,
      max_draft_m,
      light_displacement_t,
      flag,
      classification_society,
      registration_number,
      owner_name,
      hull_machinery_insurer,
      liability_insurer,
      photo_url,
      created_by,
      updated_by
    ) values (
      target_company_id,
      trim(target_name),
      nullif(trim(target_asset_type), ''),
      target_length_overall_m,
      target_breadth_overall_m,
      target_max_draft_m,
      target_light_displacement_t,
      normalized_flag,
      nullif(trim(target_classification_society), ''),
      nullif(trim(target_registration_number), ''),
      nullif(trim(target_owner_name), ''),
      nullif(trim(target_hull_machinery_insurer), ''),
      nullif(trim(target_liability_insurer), ''),
      nullif(trim(target_photo_url), ''),
      auth.uid(),
      auth.uid()
    )
    returning id into saved_id;
  else
    update public.project_towed_assets asset
    set name = trim(target_name),
        asset_type = nullif(trim(target_asset_type), ''),
        length_overall_m = target_length_overall_m,
        breadth_overall_m = target_breadth_overall_m,
        max_draft_m = target_max_draft_m,
        light_displacement_t = target_light_displacement_t,
        flag = normalized_flag,
        classification_society = nullif(trim(target_classification_society), ''),
        registration_number = nullif(trim(target_registration_number), ''),
        owner_name = nullif(trim(target_owner_name), ''),
        hull_machinery_insurer = nullif(trim(target_hull_machinery_insurer), ''),
        liability_insurer = nullif(trim(target_liability_insurer), ''),
        photo_url = nullif(trim(target_photo_url), ''),
        photo_storage_path = normalized_photo_path,
        updated_by = auth.uid()
    where asset.id = target_towed_asset_id
      and asset.company_id = target_company_id
    returning id into saved_id;

    if saved_id is null then
      raise exception 'Towed asset not found in the active company' using errcode = 'P0002';
    end if;
  end if;

  return saved_id;
exception
  when unique_violation then
    raise exception 'A towed asset with this name already exists' using errcode = '23505';
end;
$function$;


-- Preserve the existing public.publish_lifting_inspection guards and workflow.
CREATE OR REPLACE FUNCTION public.publish_lifting_inspection(p_id bigint, p_revision integer, p_storage_path text, p_file_name text, p_file_size bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.lifting_inspections%rowtype; cert bigint; category text; label text; title_text text;
begin
  select * into r from public.lifting_inspections where id=p_id for update;
  if r.id is null or r.company_id<>public.current_planning_company_id() or not public.has_any_role(array['admin','direction','armement'])
    then raise exception using errcode='42501',message='La finalisation est réservée à la Direction, à l’Armement et aux administrateurs.'; end if;
  if r.status='published' then return r.certificate_id; end if;
  if r.revision is distinct from p_revision then raise exception 'Le contrôle a changé. Rechargez-le pour générer le rapport à jour.'; end if;
  if not exists(select 1 from public.lifting_inspection_entries where inspection_id=r.id) or exists(
    select 1 from public.lifting_inspection_entries e where e.inspection_id=r.id and
      not public.lifting_entry_ready(e.item_snapshot,e.condition,e.checks,e.observations)
  ) then raise exception 'Terminez tous les contrôles et renseignez les observations pour chaque réserve.'; end if;
  if p_file_size is null or p_file_size<=0 or p_file_size>52428800 or nullif(btrim(p_file_name),'') is null
    or p_storage_path not like r.company_id::text||'/'||coalesce(nullif(r.vessel_snapshot->>'acronym',''),r.vessel_id::text)||'/lifting/'||r.id::text||'/'||r.revision::text||'-%'
    or not exists(select 1 from document_blob_private.objects() where bucket_id='fleet-certificates' and name=p_storage_path and metadata->>'mimetype'='application/pdf' and (metadata->>'size')::bigint=p_file_size)
  then raise exception 'Le PDF doit être stocké sous le navire et la version de ce contrôle.'; end if;
  category := case r.kind when 'towing' then '08-5-remorques' else '08-3-accessoires-levage' end;
  label := case r.kind when 'towing' then '08.5 - Remorques' else '08.3 - Accessoires de levage' end;
  title_text := case r.kind when 'towing' then 'Registre de suivi des remorques' else 'Registre des Apparaux de Levage' end;
  cert := public.create_fleet_certificate_document(r.vessel_id,category,label,title_text,p_file_name,p_file_name,p_storage_path,'application/pdf',p_file_size,r.issued_on,r.expires_on);
  update public.fleet_certificates set provider_name=r.inspector_name,notes='Rapport annuel Levage n° '||r.id||'. Consulter les conclusions et réserves du PDF.' where id=cert;
  update public.lifting_inspections set status='published',certificate_id=cert,storage_path=p_storage_path,published_at=clock_timestamp(),published_by=auth.uid(),updated_at=clock_timestamp() where id=r.id;
  return cert;
end $function$;


-- Preserve the existing public.register_working_time_profile_signature guards and workflow.
CREATE OR REPLACE FUNCTION public.register_working_time_profile_signature(p_person_id bigint, p_storage_path text, p_mime_type text, p_file_size_bytes bigint, p_sha256 text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage', 'pg_temp'
AS $function$
declare
  target_company_id bigint;
  target_object storage.objects%rowtype;
  next_version integer;
  saved_id bigint;
begin
  select person.company_id into target_company_id
  from public.people person
  where person.id = p_person_id and person.active;

  if target_company_id is null
    or not public.working_time_can_manage_signature_person(target_company_id, p_person_id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: signature.';
  end if;
  if not public.working_time_can_upload_signature_object('working-time-signatures', p_storage_path)
    or p_mime_type <> 'image/png'
    or p_file_size_bytes not between 1 and 1048576
    or lower(p_sha256) !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'WORKING_TIME_SIGNATURE_INVALID.';
  end if;

  select object.* into target_object
  from document_blob_private.objects() object
  where object.bucket_id = 'working-time-signatures' and object.name = p_storage_path;
  if target_object.id is null or (coalesce((target_object.metadata->>'document_blob_verified')::boolean,false)
    and target_object.metadata->>'sha256' is distinct from lower(p_sha256)) then
    raise exception using errcode = '23514', message = 'WORKING_TIME_SIGNATURE_NOT_UPLOADED.';
  end if;
  if coalesce(target_object.metadata->>'mimetype', '') <> 'image/png'
    or coalesce((target_object.metadata->>'size')::bigint, 0) <> p_file_size_bytes then
    raise exception using errcode = '23514', message = 'WORKING_TIME_SIGNATURE_METADATA_MISMATCH.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'working-time-signature:' || target_company_id || ':' || p_person_id,
    0
  ));

  update public.working_time_profile_signatures
  set valid_to = now(), revoked_by = auth.uid(), revocation_reason = 'Remplacée par une nouvelle version'
  where company_id = target_company_id and person_id = p_person_id and valid_to is null;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.working_time_profile_signatures
  where company_id = target_company_id and person_id = p_person_id;

  insert into public.working_time_profile_signatures (
    company_id, person_id, version_number, storage_path, mime_type,
    file_size_bytes, sha256, created_by
  ) values (
    target_company_id, p_person_id, next_version, trim(p_storage_path),
    p_mime_type, p_file_size_bytes, lower(p_sha256), auth.uid()
  ) returning id into saved_id;

  return saved_id;
end;
$function$;


-- Preserve the existing public.validate_hr_portrait_reference guards and workflow.
CREATE OR REPLACE FUNCTION public.validate_hr_portrait_reference()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op='UPDATE' then
    if new.photo_storage_path is not distinct from old.photo_storage_path
      and new.photo_document_id is not distinct from old.photo_document_id then return new; end if;
  end if;
  if auth.uid() is not null and (not public.has_any_role(array['admin','direction','armement'])
    or new.company_id<>public.current_planning_company_id()) then
    raise exception 'Modification de la photo refusée.' using errcode='42501';
  end if;
  if new.photo_storage_path is null then return new; end if;
  if new.photo_storage_path !~ ('^'||new.id::text||'/[a-f0-9-]{36}[.]jpg$')
    or not exists(select 1 from public.hr_documents d where d.id=new.photo_document_id
      and d.person_id=new.id and d.company_id=new.company_id and d.drive_path is not null
      and d.mime_type in ('image/png','image/jpeg'))
    or not exists(select 1 from document_blob_private.objects() o where o.bucket_id='hr-portraits' and o.name=new.photo_storage_path) then
    raise exception 'Référence de photo RH invalide.' using errcode='23514';
  end if;
  return new;
end $function$;


-- Preserve the existing qhse_policy_private.add_update_with_attachments guards and workflow.
CREATE OR REPLACE FUNCTION qhse_policy_private.add_update_with_attachments(p_objective_id uuid, p_progress numeric, p_occurred_on date, p_note text, p_expected_revision integer, p_upload_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare company bigint:=public.current_planning_company_id(); stage qhse_policy_private.uploads; token uuid; object_row storage.objects; update_id uuid;
begin
  if not qhse_policy_private.can_access(company,true) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(company::text||':qhse-policy-processes',0));
  if p_upload_ids is null or cardinality(p_upload_ids)>10 or cardinality(p_upload_ids)<>(select count(distinct u) from unnest(p_upload_ids) u) then raise exception 'QHSE_POLICY_INVALID_FILES' using errcode='22023'; end if;
  -- All validation and the original revision-checked history write are one transaction.
  for token in select value from unnest(p_upload_ids) value order by value loop
    select * into stage from qhse_policy_private.uploads where id=token for update;
    if stage.id is null or stage.company_id<>company or stage.objective_id<>p_objective_id or stage.actor_id<>auth.uid() or stage.finalized or stage.created_at<=clock_timestamp()-interval '24 hours' then raise exception 'QHSE_POLICY_INVALID_UPLOAD' using errcode='22023'; end if;
    select * into object_row from document_blob_private.objects() where bucket_id='qhse-policy-attachments' and name=stage.storage_path for share;
    if object_row.id is null or object_row.owner_id is distinct from auth.uid()::text or object_row.metadata->>'mimetype' is distinct from stage.mime_type
      or coalesce(object_row.metadata->>'size','') !~ '^[0-9]+$' or (object_row.metadata->>'size')::numeric<>stage.size_bytes then raise exception 'QHSE_POLICY_UPLOAD_MISSING_OR_INVALID' using errcode='22023'; end if;
  end loop;
  update_id:=qhse_policy_private.add_objective_update(p_objective_id,p_progress,p_occurred_on,p_note,p_expected_revision);
  foreach token in array p_upload_ids loop
    select * into stage from qhse_policy_private.uploads where id=token;
    insert into public.qhse_policy_attachments(id,company_id,objective_id,update_id,file_name,mime_type,size_bytes,storage_path)
    values(stage.id,company,p_objective_id,update_id,stage.file_name,stage.mime_type,stage.size_bytes,stage.storage_path);
    update qhse_policy_private.uploads set finalized=true where id=token;
  end loop;
  return update_id;
end $function$;



