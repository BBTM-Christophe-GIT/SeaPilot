-- A missing selection preserves existing projects. Once saved, the explicit
-- allow-list (including an empty list) is the only operational projection.
create table sea_operation_private.project_document_selections (
  project_id bigint primary key references public.projects(id) on delete cascade,
  company_id bigint not null references public.companies(id) on delete cascade,
  document_ids text[] not null default '{}',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (coalesce(array_ndims(document_ids),1) = 1 and cardinality(document_ids) <= 5000)
);
create index sea_operation_project_document_selections_company_idx
  on sea_operation_private.project_document_selections(company_id);
alter table sea_operation_private.project_document_selections enable row level security;
revoke all on sea_operation_private.project_document_selections from public,anon,authenticated;

-- Category eligibility is shared internally, independently of a caller's module
-- access. Only the guarded entry points below can expose candidate metadata.
create function sea_operation_private.project_document_category_eligible(p_company bigint,p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  with recursive ancestors as (
    select category.category_key,category.parent_key,category.label,array[category.category_key] as visited
    from public.project_document_categories category where category.company_id = p_company and category.category_key = p_key
    union all
    select parent.category_key,parent.parent_key,parent.label,child.visited || parent.category_key
    from ancestors child join public.project_document_categories parent on parent.company_id = p_company and parent.category_key = child.parent_key
    where not parent.category_key = any(child.visited)
  )
  select exists(select 1 from ancestors where parent_key is null)
    and not exists(select 1 from ancestors where category_key in ('commercial_offer','commercial_contract','commercial_appendix','billing','offer','contract_document')
      or public.normalize_import_label(label) in ('offre commerciale','offres commerciales','facturation'));
$$;

create or replace function sea_operation_private.document_category_allowed(p_company bigint,p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and sea_operation_private.can_read(p_company)
    and sea_operation_private.project_document_category_eligible(p_company,p_key);
$$;

create function sea_operation_private.project_document_candidates(p_project_id bigint,p_company bigint)
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
    and ((document.document_type = 'operation_attachment' and document.category_key is null)
      or sea_operation_private.project_document_category_eligible(p_company,document.category_key))
    and (document.subcategory_key is null or (subcategory.parent_key = document.category_key
      and sea_operation_private.project_document_category_eligible(p_company,document.subcategory_key)))
  union all
  select 'project:' || document.id::text,document.company_id,document.project_id,coalesce(nullif(document.title,''),nullif(document.file_name,''),'Document du projet'),
    coalesce(nullif(document.file_name,''),nullif(document.title,''),'Document du projet'),coalesce(nullif(document.mime_type,''),'application/octet-stream'),
    category.label,''::text,document.created_at,null::date,null::text,null::text,document.file_url
  from public.project_documents document join public.project_document_categories category
    on category.company_id = document.company_id and category.category_key = document.category_key
  where document.company_id = p_company and document.project_id = p_project_id and not document.is_folder
    and sea_operation_private.project_document_category_eligible(p_company,document.category_key);
  -- Commercial generated documents and contract_documents remain excluded by type,
  -- even if a historical row has been relabeled as an operational category.
$$;

create or replace function sea_operation_private.project_document_rows(p_project_id bigint)
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
  return query select document.* from sea_operation_private.project_document_candidates(p_project_id,company) document
    left join sea_operation_private.project_document_selections selection on selection.project_id = p_project_id and selection.company_id = company
    where selection.project_id is null or document.id = any(selection.document_ids);
end;
$$;

create function sea_operation_private.project_document_manager_company(p_project_id bigint) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare company bigint := public.current_planning_company_id();
begin
  if (select auth.uid()) is null or company is null
    or not coalesce(public.user_belongs_to_company(company),false)
    or not coalesce(public.has_any_role(array['admin','direction']),false)
    or not exists(select 1 from public.projects project where project.id = p_project_id and project.company_id = company)
  then raise exception 'La gestion des documents de ce projet est inaccessible.' using errcode = '42501'; end if;
  return company;
end;
$$;

create function sea_operation_private.project_document_selection(p_project_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare company bigint := sea_operation_private.project_document_manager_company(p_project_id); result jsonb;
begin
  select jsonb_build_object(
    'configured',exists(select 1 from sea_operation_private.project_document_selections selection where selection.project_id = p_project_id and selection.company_id = company),
    'documents',coalesce(jsonb_agg(jsonb_build_object('id',document.id,'project_id',document.project_id::text,'title',document.title,
      'file_name',document.file_name,'mime_type',document.mime_type,'category_label',document.category_label,'subcategory_label',document.subcategory_label,
      'created_at',document.created_at,'expires_on',document.expires_on,
      'selected',selection.project_id is null or document.id = any(selection.document_ids))
      order by document.category_label,document.subcategory_label,document.title,document.id),'[]'::jsonb))
    into result
  from sea_operation_private.project_document_candidates(p_project_id,company) document
  left join sea_operation_private.project_document_selections selection on selection.project_id = p_project_id and selection.company_id = company;
  return result;
end;
$$;

create function sea_operation_private.set_project_document_selection(p_project_id bigint,p_document_ids text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare company bigint := sea_operation_private.project_document_manager_company(p_project_id); selected_ids text[];
begin
  -- Serialize with archive/project updates; nothing else about the project changes.
  perform 1 from public.projects project where project.id = p_project_id and project.company_id = company and project.archived_at is null for update;
  if not found then raise exception 'Un projet archivé ne peut pas être modifié.' using errcode = '42501'; end if;
  if p_document_ids is null or coalesce(array_ndims(p_document_ids),1) <> 1 or cardinality(p_document_ids) > 5000
    or exists(select 1 from unnest(p_document_ids) item where item is null or item !~ '^(generated|project):[1-9][0-9]{0,18}$')
  then raise exception 'La sélection des documents est invalide.' using errcode = '22023'; end if;
  if exists(select 1 from unnest(p_document_ids) requested where not exists(
    select 1 from sea_operation_private.project_document_candidates(p_project_id,company) document where document.id = requested
  )) then raise exception 'Un document sélectionné est inaccessible pour ce projet.' using errcode = '42501'; end if;
  select coalesce(array_agg(item order by item),'{}'::text[]) into selected_ids from (select distinct unnest(p_document_ids) item) unique_ids;
  insert into sea_operation_private.project_document_selections(project_id,company_id,document_ids,updated_by,updated_at)
    values(p_project_id,company,selected_ids,(select auth.uid()),now())
    on conflict(project_id) do update set company_id = excluded.company_id,document_ids = excluded.document_ids,
      updated_by = excluded.updated_by,updated_at = excluded.updated_at;
  delete from sea_operation_private.project_document_grants permission where permission.project_id = p_project_id and permission.company_id = company
    and not permission.document_id = any(selected_ids);
  return sea_operation_private.project_document_selection(p_project_id);
end;
$$;

create function public.project_sea_operation_documents(p_project_id bigint) returns jsonb
language sql stable security invoker set search_path = '' as $$ select sea_operation_private.project_document_selection(p_project_id); $$;
create function public.set_project_sea_operation_documents(p_project_id bigint,p_document_ids text[]) returns jsonb
language sql security invoker set search_path = '' as $$ select sea_operation_private.set_project_document_selection(p_project_id,p_document_ids); $$;

revoke all on function sea_operation_private.project_document_category_eligible(bigint,text),sea_operation_private.project_document_candidates(bigint,bigint),
  sea_operation_private.project_document_manager_company(bigint),sea_operation_private.project_document_selection(bigint),
  sea_operation_private.set_project_document_selection(bigint,text[]) from public,anon,authenticated;
grant execute on function sea_operation_private.project_document_selection(bigint),sea_operation_private.set_project_document_selection(bigint,text[]) to authenticated;
revoke all on function public.project_sea_operation_documents(bigint),public.set_project_sea_operation_documents(bigint,text[]) from public,anon,authenticated;
grant execute on function public.project_sea_operation_documents(bigint),public.set_project_sea_operation_documents(bigint,text[]) to authenticated;
comment on function public.project_sea_operation_documents(bigint) is 'Project managers only: eligible operational document metadata and explicit selection; no private location or URL.';
comment on function public.set_project_sea_operation_documents(bigint,text[]) is 'Project managers only: replace the operational document allow-list for an active same-company project. Empty selection is explicit.';
notify pgrst,'reload schema';
