-- A read-only operational projection; the Project and Finance catalog RLS stays unchanged.
create function sea_operation_private.document_category_allowed(p_company bigint,p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  with recursive ancestors as (
    select category.category_key,category.parent_key,category.label,array[category.category_key] as visited
    from public.project_document_categories category where category.company_id = p_company and category.category_key = p_key
    union all
    select parent.category_key,parent.parent_key,parent.label,child.visited || parent.category_key
    from ancestors child join public.project_document_categories parent on parent.company_id = p_company and parent.category_key = child.parent_key
    where not parent.category_key = any(child.visited)
  )
  select (select auth.uid()) is not null and sea_operation_private.can_read(p_company)
    and exists(select 1 from ancestors where parent_key is null)
    and not exists(select 1 from ancestors where category_key in ('commercial_offer','commercial_contract','commercial_appendix','billing','offer','contract_document')
      or public.normalize_import_label(label) in ('offre commerciale','offres commerciales','facturation'));
$$;

create function sea_operation_private.project_document_rows(p_project_id bigint)
returns table(id text,company_id bigint,project_id bigint,title text,file_name text,mime_type text,category_label text,subcategory_label text,
  created_at timestamptz,expires_on date,source_bucket text,source_path text,sharepoint_url text)
language plpgsql stable security definer set search_path = '' as $$
declare company bigint := sea_operation_private.company_id();
begin
  if not coalesce(sea_operation_private.can_read(company),false) or not exists(
    select 1 from public.projects project where project.id = p_project_id and project.company_id = company and project.archived_at is null
      and exists(select 1 from public.planning_projects occurrence where occurrence.catalog_project_id = project.id
        and occurrence.company_id = company and occurrence.cancelled_at is null)
  ) then raise exception 'Documents du projet inaccessibles.' using errcode = '42501'; end if;
  return query
  select 'generated:' || document.id::text,document.company_id,document.project_id,document.file_name,document.file_name,document.mime_type,
    coalesce(category.label,'Opérations'),coalesce(subcategory.label,''),document.created_at,document.expires_on,
    document.storage_bucket,document.storage_path,document.sharepoint_web_url
  from public.project_generated_documents document
  left join public.project_document_categories category on category.company_id = document.company_id and category.category_key = document.category_key
  left join public.project_document_categories subcategory on subcategory.company_id = document.company_id and subcategory.category_key = document.subcategory_key
  where document.company_id = company and document.project_id = p_project_id and document.document_type in ('operation_attachment','project_attachment')
    and ((document.document_type = 'operation_attachment' and document.category_key is null)
      or sea_operation_private.document_category_allowed(company,document.category_key))
    and (document.subcategory_key is null or (subcategory.parent_key = document.category_key
      and sea_operation_private.document_category_allowed(company,document.subcategory_key)))
  union all
  select 'project:' || document.id::text,document.company_id,document.project_id,coalesce(nullif(document.title,''),nullif(document.file_name,''),'Document du projet'),
    coalesce(nullif(document.file_name,''),nullif(document.title,''),'Document du projet'),coalesce(nullif(document.mime_type,''),'application/octet-stream'),
    category.label,''::text,document.created_at,null::date,null::text,null::text,document.file_url
  from public.project_documents document join public.project_document_categories category
    on category.company_id = document.company_id and category.category_key = document.category_key
  where document.company_id = company and document.project_id = p_project_id and not document.is_folder
    and sea_operation_private.document_category_allowed(company,document.category_key);
  -- contract_documents and generated contracts/offers are commercial by nature,
  -- including old unclassified imports. They are deliberately never projected.
end;
$$;

create function sea_operation_private.project_documents(p_project_id bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',document.id,'project_id',document.project_id::text,'title',document.title,
    'file_name',document.file_name,'mime_type',document.mime_type,'category_label',document.category_label,'subcategory_label',document.subcategory_label,
    'created_at',document.created_at,'expires_on',document.expires_on) order by document.category_label,document.subcategory_label,document.title,document.id),'[]'::jsonb)
  from sea_operation_private.project_document_rows(p_project_id) document;
$$;

-- This resolver never returns arbitrary URLs, physical Blob URLs, or Drive IDs.
create function sea_operation_private.project_document_location(p_project_id bigint,p_document_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare document record; mapped public.project_drive_files%rowtype; bucket text; path text; url text; selected_source_path text;
begin
  select * into document from sea_operation_private.project_document_rows(p_project_id) item where item.id = p_document_id;
  if not found then raise exception 'Document inaccessible pour ce projet.' using errcode = '42501'; end if;
  bucket := document.source_bucket; path := document.source_path; url := nullif(btrim(document.sharepoint_url),'');
  if bucket = 'project-files' and path like 'projects/' || p_project_id::text || '/%'
    and path !~ '(^/|(^|/)\.\.?(/|$)|[\\[:cntrl:]])' then
    -- An alias to a commercial or billing record must not turn its bytes public.
    if exists(select 1 from public.project_billing_documents other where other.bucket_name = bucket and other.object_path = path)
      or exists(select 1 from public.contract_documents other where other.storage_bucket = bucket and other.storage_path = path)
      or exists(select 1 from public.project_generated_documents other where other.storage_bucket = bucket and other.storage_path = path
        and (other.company_id <> document.company_id or other.project_id <> p_project_id
          or other.document_type not in ('operation_attachment','project_attachment')
          or (other.category_key is not null and not sea_operation_private.document_category_allowed(document.company_id,other.category_key))
          or (other.subcategory_key is not null and not sea_operation_private.document_category_allowed(document.company_id,other.subcategory_key))))
    then raise exception 'Document commercial ou de facturation inaccessible.' using errcode = '42501'; end if;
    if exists(select 1 from public.document_blob_files mapping where mapping.source_bucket = bucket and mapping.source_path = path and mapping.active)
      or exists(select 1 from public.document_drive_files mapping where mapping.source_bucket = bucket and mapping.source_path = path and mapping.active)
      or exists(select 1 from storage.objects object where object.bucket_id = bucket and object.name = path)
    then return jsonb_build_object('bucket',bucket,'path',path,'file_name',document.file_name,'mime_type',document.mime_type); end if;
  elsif url is not null then bucket := 'sharepoint'; path := url;
  else raise exception 'Aucune copie sécurisée de ce document n’est disponible.' using errcode = '22023'; end if;

  if bucket = 'sharepoint' and (
    exists(select 1 from public.contract_documents other where other.file_url = path)
    or exists(select 1 from public.project_documents other where other.file_url = path and (other.company_id <> document.company_id
      or other.project_id is distinct from p_project_id or not sea_operation_private.document_category_allowed(document.company_id,other.category_key)))
    or exists(select 1 from public.project_generated_documents other where other.sharepoint_web_url = path and (other.company_id <> document.company_id
      or other.project_id <> p_project_id or other.document_type not in ('operation_attachment','project_attachment')
      or (other.category_key is not null and not sea_operation_private.document_category_allowed(document.company_id,other.category_key))
      or (other.subcategory_key is not null and not sea_operation_private.document_category_allowed(document.company_id,other.subcategory_key))))
  ) then raise exception 'Document commercial ou de facturation inaccessible.' using errcode = '42501'; end if;
  selected_source_path := path;
  select * into mapped from public.project_drive_files file where file.company_id = document.company_id and file.project_id = p_project_id
    and file.source_bucket = bucket and file.source_path = selected_source_path;
  if mapped.id is not null then
    return jsonb_build_object('bucket','project-drive','path',mapped.id::text,'file_name',document.file_name,'mime_type',document.mime_type);
  end if;
  if bucket = 'project-files' then
    return jsonb_build_object('bucket',bucket,'path',path,'file_name',document.file_name,'mime_type',document.mime_type);
  end if;
  if url ~* '^https://bbtm668[.]sharepoint[.]com(:443)?/sites/qhse(/|[?#]|$)' then
    return jsonb_build_object('sharepoint_url',url,'file_name',document.file_name,'mime_type',document.mime_type);
  end if;
  raise exception 'Le lien historique de ce document est invalide.' using errcode = '22023';
end;
$$;

create table sea_operation_private.project_document_grants (
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id bigint not null references public.companies(id) on delete cascade,
  project_id bigint not null references public.projects(id) on delete cascade,
  document_id text not null,storage_bucket text not null,storage_path text not null,expires_at timestamptz not null,
  primary key(user_id,project_id,document_id)
);
alter table sea_operation_private.project_document_grants enable row level security;
revoke all on sea_operation_private.project_document_grants from public,anon,authenticated;
create index sea_operation_project_document_grants_company_idx on sea_operation_private.project_document_grants(company_id);
create index sea_operation_project_document_grants_project_idx on sea_operation_private.project_document_grants(project_id);

create function sea_operation_private.project_document_access(p_project_id bigint,p_document_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare location jsonb := sea_operation_private.project_document_location(p_project_id,p_document_id);
begin
  if location ? 'bucket' then
    delete from sea_operation_private.project_document_grants where user_id = (select auth.uid()) and expires_at <= now();
    insert into sea_operation_private.project_document_grants(user_id,company_id,project_id,document_id,storage_bucket,storage_path,expires_at)
    values((select auth.uid()),sea_operation_private.company_id(),p_project_id,p_document_id,location->>'bucket',location->>'path',now()+interval '5 minutes')
    on conflict(user_id,project_id,document_id) do update set storage_bucket = excluded.storage_bucket,storage_path = excluded.storage_path,
      company_id = excluded.company_id,expires_at = excluded.expires_at;
  end if;
  return location;
end;
$$;

create function sea_operation_private.can_read_project_document_object(p_bucket text,p_path text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare scope record; location jsonb;
begin
  if (select auth.uid()) is null or p_bucket not in ('project-files','project-drive') then return false; end if;
  for scope in select * from sea_operation_private.project_document_grants permission where permission.user_id = (select auth.uid())
    and permission.storage_bucket = p_bucket and permission.storage_path = p_path and permission.expires_at > now()
    and sea_operation_private.can_read(permission.company_id)
  loop
    begin
      location := sea_operation_private.project_document_location(scope.project_id,scope.document_id);
      if location->>'bucket' = p_bucket and location->>'path' = p_path then return true; end if;
    exception when insufficient_privilege or invalid_parameter_value then null; end;
  end loop;
  return false;
end;
$$;

create policy sea_operation_project_document_read on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and sea_operation_private.can_read_project_document_object(bucket_id,name));
create policy sea_operation_project_document_drive_read on public.project_drive_files for select to authenticated
  using (sea_operation_private.can_read_project_document_object('project-drive',id::text));
create policy sea_operation_project_document_google_read on public.document_drive_files for select to authenticated
  using (active and source_bucket = 'project-files' and sea_operation_private.can_read_project_document_object(source_bucket,source_path));

create function public.sea_operation_project_documents(p_project_id bigint) returns jsonb
language sql stable security invoker set search_path = '' as $$ select sea_operation_private.project_documents(p_project_id); $$;
create function public.sea_operation_project_document_access(p_project_id bigint,p_document_id text) returns jsonb
language sql security invoker set search_path = '' as $$ select sea_operation_private.project_document_access(p_project_id,p_document_id); $$;

revoke all on function sea_operation_private.document_category_allowed(bigint,text),sea_operation_private.project_document_rows(bigint),
  sea_operation_private.project_documents(bigint),sea_operation_private.project_document_location(bigint,text),
  sea_operation_private.project_document_access(bigint,text),sea_operation_private.can_read_project_document_object(text,text) from public,anon,authenticated;
grant execute on function sea_operation_private.project_documents(bigint),sea_operation_private.project_document_access(bigint,text),
  sea_operation_private.can_read_project_document_object(text,text) to authenticated;
revoke all on function public.sea_operation_project_documents(bigint),public.sea_operation_project_document_access(bigint,text) from public,anon,authenticated;
grant execute on function public.sea_operation_project_documents(bigint),public.sea_operation_project_document_access(bigint,text) to authenticated;
comment on function public.sea_operation_project_documents(bigint) is 'Company-scoped operational documents for a planned project, excluding commercial offers, billing and their descendants.';
notify pgrst,'reload schema';
