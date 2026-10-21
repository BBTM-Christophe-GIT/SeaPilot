-- Captains may add new documents to themselves and their current RH watch.
-- The existing manager update/delete policies and Marin permissions stay intact.
create function public.hr_document_can_add(target_person bigint)
returns boolean language sql stable security invoker set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from public.people p
    where p.id=target_person and p.company_id=public.current_planning_company_id()
      and public.user_belongs_to_company(p.company_id)
      and (
        public.has_any_role(array['admin','direction','armement'])
        or (public.has_role('capitaine') and (
          p.user_id=auth.uid()
          or public.captain_shares_watch_with_person(p.company_id,p.id)
        ))
      )
  );
$$;
revoke all on function public.hr_document_can_add(bigint) from public,anon;
grant execute on function public.hr_document_can_add(bigint) to authenticated,service_role;

create or replace function public.hr_document_drive_scope(target_person bigint default null, target_document bigint default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare p public.people%rowtype; d public.hr_documents%rowtype; folder text;
begin
  if auth.uid() is null then raise exception 'Session requise.' using errcode='42501'; end if;
  if target_document is not null then
    select * into d from public.hr_documents where id=target_document;
    if not found or d.drive_path is null then raise exception 'Fichier RH inaccessible.' using errcode='42501'; end if;
    return jsonb_build_object('directory','Ressources Humaines','path',d.drive_path,
      'sha256',d.drive_sha256,'bytes',d.file_size_bytes);
  end if;
  if not public.hr_document_can_add(target_person) then
    raise exception 'Modification RH refusée.' using errcode='42501';
  end if;
  select * into p from public.people where id=target_person and company_id=public.current_planning_company_id();
  if not found then raise exception 'Collaborateur inaccessible.' using errcode='42501'; end if;
  -- Reuse the original folder even after a collaborator's name changes.
  select split_part(drive_path,'/',1) into folder from public.hr_documents
    where person_id=p.id and company_id=p.company_id and drive_path is not null order by id limit 1;
  if folder is null then
    folder:=rtrim(left(regexp_replace(p.first_name||' '||upper(p.last_name),'[<>:"/\\|?*[:cntrl:]]','-','g'),75),'. ');
    if folder='' or folder ~* '^(con|prn|aux|nul|com[1-9]|lpt[1-9])([.]|$)' then folder:='Collaborateur-'||folder; end if;
    folder:=folder||' - c'||p.company_id||'-p'||p.id;
  end if;
  return jsonb_build_object('directory','Ressources Humaines','folder',folder);
end $$;
revoke all on function public.hr_document_drive_scope(bigint,bigint) from public,anon;
grant execute on function public.hr_document_drive_scope(bigint,bigint) to authenticated;


-- Blob authorization evaluates these live Storage policies against a virtual
-- tuple, with the real uploader id. No broad bucket or company upload grant.
create policy hr_documents_captain_storage_insert on storage.objects
for insert to authenticated with check (
  bucket_id='hr-documents'
  and public.has_role('capitaine')
  and owner_id=(select auth.uid())::text
  and name ~ '^people/[1-9][0-9]*/[a-f0-9-]{36}-[^/]+$'
  and public.hr_document_can_add(
    case when split_part(name,'/',2) ~ '^[1-9][0-9]{0,17}$'
      then split_part(name,'/',2)::bigint else null end
  )
);

create or replace function public.document_blob_can_upload(
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
          or not public.hr_document_can_add(target_person.id) then return false; end if;
      end if;
      return document_blob_private.storage_allowed('upload',target_bucket,target_path,auth.uid()::text);
  end case;
end;
$$;
revoke all on function public.document_blob_can_upload(text,text,text,bigint,jsonb) from public,anon;
grant execute on function public.document_blob_can_upload(text,text,text,bigint,jsonb) to authenticated,service_role;



-- A new HR row must refer to this captain's completed, server-verified Blob
-- upload for that exact person. Existing documents cannot be overwritten.
create policy hr_documents_captain_insert on public.hr_documents
for insert to authenticated with check (
  company_id=(select public.current_planning_company_id())
  and public.has_role('capitaine')
  and public.hr_document_can_add(person_id)
  and category_key in ('administrative','certificate','deck','engine','lifting',
    'medical_visit','safety_training','safety_induction')
  and status in ('valid','renew_due','expired')
  and source_label='seapilot_blob'
  and drive_path is null and drive_sha256 is null and drive_file_id is null
  and file_url is null and storage_bucket='hr-documents'
  and split_part(storage_path,'/',1)='people'
  and split_part(storage_path,'/',2)=person_id::text
  and file_size_bytes between 1 and 26214400
  and exists (
    select 1 from public.document_blob_files f
    where f.source_bucket=hr_documents.storage_bucket
      and f.source_path=hr_documents.storage_path and f.active
      and f.uploader_id=(select auth.uid())
      and f.bytes=hr_documents.file_size_bytes
      and f.mime_type=hr_documents.mime_type
  )
);
