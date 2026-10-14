-- Preserve company category history and make immutable attachment registration retryable.
-- Existing RLS, role grants, bucket limits and Blob upload/verification rules remain authoritative.

CREATE OR REPLACE FUNCTION public.projects_save_document_categories(target_categories jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_company_id bigint := public.current_planning_company_id();
begin
  if auth.uid() is null or target_company_id is null
     or not coalesce(public.user_belongs_to_company(target_company_id), false)
     or not coalesce(public.has_any_role(array['admin', 'direction']), false) then
    raise exception 'Insufficient permission to manage project document categories' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(target_categories, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(target_categories, '[]'::jsonb)) = 0 then
    raise exception 'Document categories must be a non-empty JSON array' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(target_categories) as item(
      category_key text,
      parent_key text,
      label text,
      display_order integer,
      active boolean
    )
    where item.category_key is null
       or item.category_key !~ '^[a-z0-9][a-z0-9_-]{2,63}$'
       or nullif(btrim(item.label), '') is null
       or item.parent_key = item.category_key
  ) then
    raise exception 'Invalid document category payload' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(target_categories) as item(category_key text)
    group by item.category_key having count(*) > 1
  ) then
    raise exception 'Document category keys must be unique' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(target_categories)
      as item(parent_key text, label text, active boolean)
    where coalesce(item.active, true)
    group by item.parent_key, lower(btrim(item.label)) having count(*) > 1
  ) then
    raise exception 'Active document category names must be unique at the same level' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(target_categories) as item(
      category_key text,
      parent_key text,
      label text,
      display_order integer,
      active boolean
    )
    where item.parent_key is not null
      and not exists (
        select 1
        from jsonb_to_recordset(target_categories) as parent(
          category_key text,
          parent_key text,
          label text,
          display_order integer,
          active boolean
        )
        where parent.category_key = item.parent_key
          and parent.parent_key is null
          and (not coalesce(item.active, true) or coalesce(parent.active, true))
      )
  ) then
    raise exception 'Every subcategory requires a root category, active when the child is active' using errcode = '22023';
  end if;

  -- Serializes this company's catalog save and attachment registration. No row
  -- is deleted: omitted keys are retired, retaining all document foreign keys.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('project-document-categories:' || target_company_id::text, 0)
  );
  if exists (
    select 1 from jsonb_to_recordset(target_categories)
      as item(category_key text, parent_key text)
    join public.project_document_categories category
      on category.company_id = target_company_id and category.category_key = item.category_key
    where category.parent_key is distinct from item.parent_key
      and exists (
        select 1 from public.project_generated_documents document
        where document.company_id = target_company_id
          and (document.category_key = category.category_key or document.subcategory_key = category.category_key)
      )
  ) then
    raise exception 'Referenced document category hierarchy cannot be changed' using errcode = '22023';
  end if;

  update public.project_document_categories category
  set active = false,
      updated_at = now(),
      updated_by = auth.uid()
  where category.company_id = target_company_id
    and not exists (
      select 1
      from jsonb_to_recordset(target_categories) as item(
        category_key text,
        parent_key text,
        label text,
        display_order integer,
        active boolean
      )
      where item.category_key = category.category_key
    );

  insert into public.project_document_categories (
    company_id,
    category_key,
    parent_key,
    label,
    display_order,
    active,
    created_by,
    updated_by
  )
  select
    target_company_id,
    item.category_key,
    null,
    btrim(item.label),
    coalesce(item.display_order, 0),
    coalesce(item.active, true),
    auth.uid(),
    auth.uid()
  from jsonb_to_recordset(target_categories) as item(
    category_key text,
    parent_key text,
    label text,
    display_order integer,
    active boolean
  )
  where item.parent_key is null
  on conflict (company_id, category_key) do update
  set parent_key = null,
      label = excluded.label,
      display_order = excluded.display_order,
      active = excluded.active,
      updated_at = now(),
      updated_by = auth.uid();

  insert into public.project_document_categories (
    company_id,
    category_key,
    parent_key,
    label,
    display_order,
    active,
    created_by,
    updated_by
  )
  select
    target_company_id,
    item.category_key,
    item.parent_key,
    btrim(item.label),
    coalesce(item.display_order, 0),
    coalesce(item.active, true),
    auth.uid(),
    auth.uid()
  from jsonb_to_recordset(target_categories) as item(
    category_key text,
    parent_key text,
    label text,
    display_order integer,
    active boolean
  )
  where item.parent_key is not null
  on conflict (company_id, category_key) do update
  set parent_key = excluded.parent_key,
      label = excluded.label,
      display_order = excluded.display_order,
      active = excluded.active,
      updated_at = now(),
      updated_by = auth.uid();
end;
$function$;

CREATE OR REPLACE FUNCTION public.projects_register_storage_attachment(target_project_id bigint, target_bucket text, target_path text, target_file_name text, target_mime_type text, target_file_size_bytes bigint, target_sha256 text, target_category_key text, target_subcategory_key text DEFAULT NULL::text, target_expires_on date DEFAULT NULL::date)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_company_id bigint := public.current_planning_company_id();
  registered_document_id bigint;
  existing_document public.project_generated_documents;
  existing_count integer;
begin
  if auth.uid() is null or target_company_id is null
     or not coalesce(public.user_belongs_to_company(target_company_id), false)
     or not coalesce(public.has_any_role(array['admin', 'direction']), false) then
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

  if target_bucket is distinct from 'project-files'
     or nullif(btrim(target_path), '') is null
     or target_path not like 'projects/' || target_project_id::text || '/attachments/%'
     or nullif(btrim(target_file_name), '') is null
     or nullif(btrim(target_mime_type), '') is null
     or target_file_size_bytes is null or target_file_size_bytes <= 0
     or target_sha256 is null or target_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid project attachment metadata' using errcode = '22023';
  end if;


  -- Use the same catalog lock as category saves, then serialize this logical
  -- path. A retry cannot append a second registry row or change the first one.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('project-document-categories:' || target_company_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('project-attachment:' || target_company_id::text || ':' ||
      target_project_id::text || ':' || target_bucket || ':' || target_path, 0)
  );
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


  select count(*) into existing_count from public.project_generated_documents document
  where document.company_id = target_company_id and document.project_id = target_project_id
    and document.storage_bucket = target_bucket and document.storage_path = target_path;
  if existing_count > 0 then
    select * into existing_document from public.project_generated_documents document
    where document.company_id = target_company_id and document.project_id = target_project_id
      and document.storage_bucket = target_bucket and document.storage_path = target_path
    order by document.id limit 1;
    if existing_count <> 1 or existing_document.document_type <> 'project_attachment'
      or existing_document.planning_occurrence_id is not null
      or existing_document.file_name is distinct from btrim(target_file_name)
      or existing_document.mime_type is distinct from btrim(target_mime_type)
      or existing_document.file_size_bytes is distinct from target_file_size_bytes
      or existing_document.sha256 is distinct from target_sha256
      or existing_document.category_key is distinct from target_category_key
      or existing_document.subcategory_key is distinct from target_subcategory_key
      or existing_document.expires_on is distinct from target_expires_on then
      raise exception 'PROJECT_ATTACHMENT_PATH_CONFLICT' using errcode = '22023';
    end if;
    -- This is an acknowledgement, including after category retirement. A new
    -- document still requires an active root and correctly bound subcategory.
    return existing_document.id;
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

-- CREATE OR REPLACE retains the existing ACLs; explicitly keep anonymous execution closed.
revoke all on function public.projects_save_document_categories(jsonb) from public, anon;
revoke all on function public.projects_register_storage_attachment(bigint,text,text,text,text,bigint,text,text,text,date) from public, anon;
