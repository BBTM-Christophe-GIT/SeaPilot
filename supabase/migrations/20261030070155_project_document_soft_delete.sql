-- Logical deletion only: original rows, bytes, shared mappings and source provenance remain intact.
create table project_document_private.deleted_documents(
  document_kind text not null check(document_kind in ('generated','project','contract')),
  document_id bigint not null,
  company_id bigint not null references public.companies(id) on delete restrict,
  project_id bigint not null references public.projects(id) on delete restrict,
  expected_document jsonb not null check(jsonb_typeof(expected_document)='object'),
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz not null default clock_timestamp(),
  primary key(document_kind,document_id)
);
create index project_deleted_documents_company_idx on project_document_private.deleted_documents(company_id,project_id);
alter table project_document_private.deleted_documents enable row level security;
revoke all on project_document_private.deleted_documents from public,anon,authenticated,service_role;

create function project_document_private.document_deleted(p_kind text,p_id bigint) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from project_document_private.deleted_documents item where item.document_kind=p_kind and item.document_id=p_id);
$$;

-- This exact, typed fingerprint detects source refreshes, reclassification and file replacement after confirmation.
create function project_document_private.deletion_expected(p_document jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'file_name',coalesce(nullif(btrim(p_document->>'file_name'),''),nullif(btrim(p_document->>'title'),''),'Document sans nom'),
    'category_key',nullif(btrim(p_document->>'category_key'),''),'subcategory_key',nullif(btrim(p_document->>'subcategory_key'),''),
    'storage_bucket',nullif(btrim(p_document->>'storage_bucket'),''),'storage_path',nullif(btrim(p_document->>'storage_path'),''),
    'source_url',nullif(btrim(case when p_document ? 'document_type' then p_document->>'sharepoint_web_url' else p_document->>'file_url' end),''),
    'file_size_bytes',p_document->'file_size_bytes',
    'modified_at',case when nullif(case when p_document ? 'document_type' then p_document->>'created_at' else p_document->>'source_modified_at' end,'') is not null
      then to_char((case when p_document ? 'document_type' then p_document->>'created_at' else p_document->>'source_modified_at' end)::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end);
$$;

create function project_document_private.deletion_record(p_project bigint,p_company bigint,p_document text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare kind text; identifier bigint; source_table text; result jsonb;
begin
  if p_document is null or p_document !~ '^(generated|project|contract):[1-9][0-9]{0,18}$' then
    raise exception 'La référence du document est invalide.' using errcode='22023'; end if;
  kind:=split_part(p_document,':',1);
  begin identifier:=split_part(p_document,':',2)::bigint;
  exception when numeric_value_out_of_range then raise exception 'La référence du document est invalide.' using errcode='22023'; end;
  source_table:=case kind when 'generated' then 'project_generated_documents' when 'project' then 'project_documents' else 'contract_documents' end;
  execute format('select to_jsonb(document) from public.%I document where document.id=$1 and document.company_id=$2 and document.project_id=$3 %s for update',
    source_table,case when kind='generated' then '' else 'and not document.is_folder' end)
    into result using identifier,p_company,p_project;
  if result is null then raise exception 'Document inaccessible pour ce projet.' using errcode='42501'; end if;
  return result;
end;
$$;

create function project_document_private.deletion_snapshot(target_project_id bigint,target_document_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare company bigint:=sea_operation_private.project_document_manager_company(target_project_id); snapshot jsonb;
begin
  perform 1 from public.projects project where project.id=target_project_id and project.company_id=company and project.archived_at is null for key share;
  if not found then raise exception 'Un projet clôturé ne peut pas être modifié.' using errcode='42501'; end if;
  snapshot:=project_document_private.deletion_record(target_project_id,company,target_document_id);
  if project_document_private.document_deleted(split_part(target_document_id,':',1),(snapshot->>'id')::bigint) then
    raise exception 'Ce document a déjà été supprimé du projet.' using errcode='42501'; end if;
  return jsonb_build_object('project_id',target_project_id::text,'document_id',target_document_id,
    'expected_document',project_document_private.deletion_expected(snapshot));
end;
$$;

create function project_document_private.delete_document(target_project_id bigint,target_document_id text,target_expected_document jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare company bigint:=sea_operation_private.project_document_manager_company(target_project_id); snapshot jsonb; expected jsonb;
  kind text; identifier bigint; prior project_document_private.deleted_documents; removed_at timestamptz;
begin
  -- Upload registration already takes this lock before its project FK check; keep the same order.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('project-document-categories:'||company::text,0));
  perform 1 from public.projects project where project.id=target_project_id and project.company_id=company and project.archived_at is null for update;
  if not found then raise exception 'Un projet clôturé ne peut pas être modifié.' using errcode='42501'; end if;
  if target_document_id is null or target_document_id !~ '^(generated|project|contract):[1-9][0-9]{0,18}$'
    or jsonb_typeof(target_expected_document) is distinct from 'object' then
    raise exception 'La suppression du document est invalide.' using errcode='22023'; end if;
  kind:=split_part(target_document_id,':',1);
  begin identifier:=split_part(target_document_id,':',2)::bigint;
  exception when numeric_value_out_of_range then raise exception 'La référence du document est invalide.' using errcode='22023'; end;
  select * into prior from project_document_private.deleted_documents item where item.document_kind=kind and item.document_id=identifier;
  if found then
    if prior.company_id<>company or prior.project_id<>target_project_id then raise exception 'Document inaccessible pour ce projet.' using errcode='42501'; end if;
    if prior.expected_document is distinct from target_expected_document then raise exception 'Le document confirmé ne correspond pas à la suppression enregistrée.' using errcode='40001'; end if;
    return jsonb_build_object('project_id',target_project_id::text,'document_id',target_document_id,'deleted_at',prior.deleted_at);
  end if;
  snapshot:=project_document_private.deletion_record(target_project_id,company,target_document_id);
  expected:=project_document_private.deletion_expected(snapshot);
  if expected is distinct from target_expected_document then raise exception 'Ce document a été modifié. Rechargez la liste avant de le supprimer.' using errcode='40001'; end if;
  insert into project_document_private.deleted_documents(document_kind,document_id,company_id,project_id,expected_document,deleted_by)
    values(kind,identifier,company,target_project_id,expected,(select auth.uid())) returning deleted_at into removed_at;
  update sea_operation_private.project_document_selections selection
    set document_ids=array_remove(selection.document_ids,target_document_id),updated_at=clock_timestamp(),updated_by=(select auth.uid())
    where selection.company_id=company and target_document_id=any(selection.document_ids);
  delete from sea_operation_private.project_document_grants permission where permission.company_id=company and permission.document_id=target_document_id;
  insert into public.project_change_log(company_id,entity_type,entity_id,action,changed_by,old_values,new_values)
    values(company,case kind when 'generated' then 'project_generated_documents' when 'project' then 'project_documents' else 'contract_documents' end,
      identifier,'delete',(select auth.uid()),snapshot-'source_payload',
      jsonb_build_object('id',identifier,'project_id',target_project_id,'file_name',expected->>'file_name','deleted_at',removed_at,'deleted_by',(select auth.uid())));
  return jsonb_build_object('project_id',target_project_id::text,'document_id',target_document_id,'deleted_at',removed_at);
end;
$$;

create function public.projects_document_deletion_snapshot(target_project_id bigint,target_document_id text) returns jsonb
language sql security invoker set search_path='' as $$ select project_document_private.deletion_snapshot(target_project_id,target_document_id); $$;
create function public.projects_delete_document(target_project_id bigint,target_document_id text,target_expected_document jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select project_document_private.delete_document(target_project_id,target_document_id,target_expected_document); $$;

-- Restrictive policies intersect every existing role-specific SELECT permission, including Planning readers.
create policy project_documents_not_deleted on public.project_documents as restrictive for select to authenticated
  using(not project_document_private.document_deleted('project',id));
create policy contract_documents_not_deleted on public.contract_documents as restrictive for select to authenticated
  using(not project_document_private.document_deleted('contract',id));
create policy project_generated_documents_not_deleted on public.project_generated_documents as restrictive for select to authenticated
  using(not project_document_private.document_deleted('generated',id));

-- Source locations may be shared. Deny fresh access only when a deleted reference owns the location
-- and no live same-company business reference still owns those bytes. Never deactivate shared mappings.
create function project_document_private.location_visible(p_bucket text,p_path text,p_company bigint default null) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare company bigint:=coalesce(p_company,public.current_planning_company_id()); bucket text:=p_bucket; path text:=p_path; deleted boolean;
begin
  if bucket not in ('project-files','sharepoint','project-drive') then return true; end if;
  if (select auth.uid()) is null or company is null or not coalesce(public.user_belongs_to_company(company),false) then return false; end if;
  if bucket='project-drive' then
    select item.source_bucket,item.source_path into bucket,path from public.project_drive_files item where item.id::text=p_path and item.company_id=company;
    if not found then return false; end if;
  end if;
  select exists(select 1 from project_document_private.deleted_documents item where item.company_id=company and (
      item.expected_document->>'storage_bucket'=bucket and item.expected_document->>'storage_path'=path or item.expected_document->>'source_url'=path))
    or exists(select 1 from public.project_generated_documents item where item.company_id=company and project_document_private.document_deleted('generated',item.id)
      and (item.storage_bucket=bucket and item.storage_path=path or item.sharepoint_web_url=path))
    or exists(select 1 from public.project_documents item where item.company_id=company and project_document_private.document_deleted('project',item.id)
      and item.file_url=path)
    or exists(select 1 from public.contract_documents item where item.company_id=company and project_document_private.document_deleted('contract',item.id)
      and (item.storage_bucket=bucket and item.storage_path=path or item.file_url=path)) into deleted;
  if not deleted then return true; end if;
  return exists(select 1 from public.project_generated_documents item where item.company_id=company and not project_document_private.document_deleted('generated',item.id)
      and (item.storage_bucket=bucket and item.storage_path=path or item.sharepoint_web_url=path))
    or exists(select 1 from public.project_documents item where item.company_id=company and not item.is_folder and not project_document_private.document_deleted('project',item.id)
      and item.file_url=path)
    or exists(select 1 from public.contract_documents item where item.company_id=company and not item.is_folder and not project_document_private.document_deleted('contract',item.id)
      and (item.storage_bucket=bucket and item.storage_path=path or item.file_url=path))
    or exists(select 1 from public.project_billing_documents item where item.company_id=company and item.bucket_name=bucket and item.object_path=path);
end;
$$;
create policy project_deleted_document_read on storage.objects as restrictive for select to authenticated
  using(project_document_private.location_visible(bucket_id,name));
create policy project_deleted_document_read on public.project_drive_files as restrictive for select to authenticated
  using(project_document_private.location_visible(source_bucket,source_path,company_id));
create policy project_deleted_document_read on public.document_drive_files as restrictive for select to authenticated
  using(project_document_private.location_visible(source_bucket,source_path));
-- This also intersects the uploader exception in the Blob policy, preventing a stale owner scope from reopening deleted bytes.
create policy project_deleted_document_read on public.document_blob_files as restrictive for select to authenticated
  using(project_document_private.location_visible(source_bucket,source_path));

revoke all on function project_document_private.document_deleted(text,bigint),project_document_private.deletion_expected(jsonb),
  project_document_private.deletion_record(bigint,bigint,text),project_document_private.deletion_snapshot(bigint,text),
  project_document_private.delete_document(bigint,text,jsonb),project_document_private.location_visible(text,text,bigint)
  from public,anon,authenticated,service_role;
grant execute on function project_document_private.document_deleted(text,bigint),project_document_private.location_visible(text,text,bigint),
  project_document_private.deletion_snapshot(bigint,text),project_document_private.delete_document(bigint,text,jsonb) to authenticated;
revoke all on function public.projects_document_deletion_snapshot(bigint,text),public.projects_delete_document(bigint,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.projects_document_deletion_snapshot(bigint,text),public.projects_delete_document(bigint,text,jsonb) to authenticated;

-- Definer readers must explicitly exclude tombstones; all commercial provenance/alias guards remain unchanged.
create or replace function project_document_private.set_category(target_project_id bigint,target_document_id text,target_category_key text,target_subcategory_key text,target_expected_category_key text,target_expected_subcategory_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare company bigint:=sea_operation_private.project_document_manager_company(target_project_id); kind text; document_id bigint; snapshot jsonb; current_category text; current_subcategory text;
  category text:=nullif(btrim(target_category_key),''); subcategory text:=nullif(btrim(target_subcategory_key),'');
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('project-document-categories:'||company::text,0));
  perform 1 from public.projects project where project.id=target_project_id and project.company_id=company and project.archived_at is null for update;
  if not found then raise exception 'Un projet clôturé ne peut pas être modifié.' using errcode='42501'; end if;
  if target_document_id is null or target_document_id !~ '^(generated|project|contract):[1-9][0-9]{0,18}$'
    or category is null or category !~ '^[a-z0-9][a-z0-9_-]{2,63}$'
    or subcategory is not null and subcategory !~ '^[a-z0-9][a-z0-9_-]{2,63}$'
  then raise exception 'Le classement du document est invalide.' using errcode='22023'; end if;
  kind:=split_part(target_document_id,':',1);
  begin document_id:=split_part(target_document_id,':',2)::bigint;
  exception when numeric_value_out_of_range then raise exception 'Le document est invalide.' using errcode='22023'; end;
  if kind='generated' then
    select to_jsonb(document) into snapshot from public.project_generated_documents document where document.id=document_id and document.company_id=company and document.project_id=target_project_id and not project_document_private.document_deleted(kind,document.id) for update;
  elsif kind='project' then
    select to_jsonb(document) into snapshot from public.project_documents document where document.id=document_id and document.company_id=company and document.project_id=target_project_id and not project_document_private.document_deleted(kind,document.id) and not document.is_folder for update;
  else
    select to_jsonb(document) into snapshot from public.contract_documents document where document.id=document_id and document.company_id=company and document.project_id=target_project_id and not project_document_private.document_deleted(kind,document.id) and not document.is_folder for update;
  end if;
  if snapshot is null then raise exception 'Document inaccessible pour ce projet.' using errcode='42501'; end if;
  current_category:=nullif(btrim(snapshot->>'category_key'),''); current_subcategory:=nullif(btrim(snapshot->>'subcategory_key'),'');
  if current_category is distinct from category or current_subcategory is distinct from subcategory then
    if current_category is distinct from nullif(btrim(target_expected_category_key),'') or current_subcategory is distinct from nullif(btrim(target_expected_subcategory_key),'') then
      raise exception 'Le classement de ce document a été modifié. Rechargez la liste avant de continuer.' using errcode='40001'; end if;
    if not exists(select 1 from public.project_document_categories item where item.company_id=company and item.category_key=category and item.parent_key is null and item.active)
      or subcategory is not null and not exists(select 1 from public.project_document_categories item where item.company_id=company and item.category_key=subcategory and item.parent_key=category and item.active)
    then raise exception 'Choisissez une catégorie active et une sous-catégorie associée.' using errcode='22023'; end if;
    if kind='generated' then
      update public.project_generated_documents document set category_key=category,subcategory_key=subcategory where document.id=document_id and document.company_id=company and document.project_id=target_project_id and not project_document_private.document_deleted(kind,document.id);
    elsif kind='project' then
      update public.project_documents document set category_key=category,subcategory_key=subcategory,updated_by=(select auth.uid()) where document.id=document_id and document.company_id=company and document.project_id=target_project_id and not project_document_private.document_deleted(kind,document.id);
    else
      update public.contract_documents document set category_key=category,subcategory_key=subcategory,updated_by=(select auth.uid()) where document.id=document_id and document.company_id=company and document.project_id=target_project_id and not project_document_private.document_deleted(kind,document.id);
    end if;
  end if;
  return jsonb_build_object('project_id',target_project_id::text,'document_id',target_document_id,'category_key',category,'subcategory_key',subcategory);
end;
$$;

create or replace function sea_operation_private.project_document_candidates(p_project_id bigint,p_company bigint)
returns table(id text,company_id bigint,project_id bigint,title text,file_name text,mime_type text,category_label text,subcategory_label text,
  created_at timestamptz,expires_on date,source_bucket text,source_path text,sharepoint_url text)
language sql stable security definer set search_path = '' as $$
  select 'generated:' || document.id::text,document.company_id,document.project_id,document.file_name,document.file_name,document.mime_type,
    coalesce(category.label,'Opérations'),coalesce(subcategory.label,''),document.created_at,document.expires_on,
    document.storage_bucket,document.storage_path,document.sharepoint_web_url
  from public.project_generated_documents document
  left join public.project_document_categories category on category.company_id = document.company_id and category.category_key = document.category_key
  left join public.project_document_categories subcategory on subcategory.company_id = document.company_id and subcategory.category_key = document.subcategory_key
  where document.company_id = p_company and document.project_id = p_project_id and document.document_type in ('operation_attachment','project_attachment')
    and not project_document_private.document_deleted('generated',document.id) and not project_document_private.was_commercial('generated',document.id)
    and ((document.document_type = 'operation_attachment' and document.category_key is null)
      or sea_operation_private.project_document_category_eligible(p_company,document.category_key))
    and (document.subcategory_key is null or (subcategory.parent_key = document.category_key
      and sea_operation_private.project_document_category_eligible(p_company,document.subcategory_key)))
  union all
  select 'project:' || document.id::text,document.company_id,document.project_id,coalesce(nullif(document.title,''),nullif(document.file_name,''),'Document du projet'),
    coalesce(nullif(document.file_name,''),nullif(document.title,''),'Document du projet'),coalesce(nullif(document.mime_type,''),'application/octet-stream'),
    category.label,coalesce(subcategory.label,''),document.created_at,null::date,null::text,null::text,document.file_url
  from public.project_documents document join public.project_document_categories category
    on category.company_id = document.company_id and category.category_key = document.category_key
  left join public.project_document_categories subcategory on subcategory.company_id=document.company_id and subcategory.category_key=document.subcategory_key
  where document.company_id = p_company and document.project_id = p_project_id and not document.is_folder
    and not project_document_private.document_deleted('project',document.id) and not project_document_private.was_commercial('project',document.id)
    and (document.subcategory_key is null or (subcategory.parent_key=document.category_key and sea_operation_private.project_document_category_eligible(p_company,document.subcategory_key)))
    and sea_operation_private.project_document_category_eligible(p_company,document.category_key);
  -- Commercial generated documents and contract_documents remain excluded by type,
  -- even if a historical row has been relabeled as an operational category.
$$;



notify pgrst,'reload schema';
