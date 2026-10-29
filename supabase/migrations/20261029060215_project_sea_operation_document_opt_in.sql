-- Documents are opt-in from the Project list. Existing explicit choices remain
-- untouched; a missing configuration never exposes a project document.
create or replace function sea_operation_private.project_document_category_eligible(p_company bigint,p_key text) returns boolean
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
    and not exists(select 1 from ancestors
      where regexp_replace(public.normalize_import_label(category_key),'[^a-z0-9]','','g') in
        ('commercialoffer','commercialoffers','commercialcontract','commercialcontracts','commercialappendix','billing','offer','offers',
          'contractdocument','contractdocuments','contract','contracts','contrat','contrats')
      or regexp_replace(public.normalize_import_label(label),'[^a-z0-9]','','g') in
        ('offrecommerciale','offrescommerciales','facturation','contrat','contrats','contract','contracts','commercialoffer','commercialoffers'));
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
    join sea_operation_private.project_document_selections selection on selection.project_id = p_project_id and selection.company_id = company
    where document.id = any(selection.document_ids);
end;
$$;

create or replace function sea_operation_private.project_document_selection(p_project_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare company bigint := sea_operation_private.project_document_manager_company(p_project_id); result jsonb;
begin
  select jsonb_build_object(
    'configured',exists(select 1 from sea_operation_private.project_document_selections selection where selection.project_id = p_project_id and selection.company_id = company),
    'documents',coalesce(jsonb_agg(jsonb_build_object('id',document.id,'project_id',document.project_id::text,'title',document.title,
      'file_name',document.file_name,'mime_type',document.mime_type,'category_label',document.category_label,'subcategory_label',document.subcategory_label,
      'created_at',document.created_at,'expires_on',document.expires_on,
      'selected',coalesce(document.id = any(selection.document_ids),false))
      order by document.category_label,document.subcategory_label,document.title,document.id),'[]'::jsonb))
    into result
  from sea_operation_private.project_document_candidates(p_project_id,company) document
  left join sea_operation_private.project_document_selections selection on selection.project_id = p_project_id and selection.company_id = company;
  return result;
end;
$$;

create function sea_operation_private.set_project_document_selected(p_project_id bigint,p_document_id text,p_selected boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare company bigint := sea_operation_private.project_document_manager_company(p_project_id); selected_ids text[];
begin
  -- Lock before reading the current list: two clients toggling distinct documents
  -- must merge their choices instead of replacing each other's stale snapshots.
  perform 1 from public.projects project where project.id = p_project_id and project.company_id = company and project.archived_at is null for update;
  if not found then raise exception 'Un projet archivé ne peut pas être modifié.' using errcode = '42501'; end if;
  if p_selected is null or p_document_id is null or p_document_id !~ '^(generated|project):[1-9][0-9]{0,18}$'
  then raise exception 'La sélection du document est invalide.' using errcode = '22023'; end if;
  if not exists(select 1 from sea_operation_private.project_document_candidates(p_project_id,company) document where document.id = p_document_id)
  then raise exception 'Le document sélectionné est inaccessible pour ce projet.' using errcode = '42501'; end if;
  -- Omit stale/deleted/reclassified IDs while preserving every other eligible
  -- explicit choice. The category guard is also rechecked when the file is opened.
  select coalesce(array_agg(document.id order by document.id),'{}'::text[]) into selected_ids
  from sea_operation_private.project_document_candidates(p_project_id,company) document
  join sea_operation_private.project_document_selections selection on selection.project_id = p_project_id and selection.company_id = company
  where document.id = any(selection.document_ids);
  if p_selected then
    if not p_document_id = any(selected_ids) then selected_ids := array_append(selected_ids,p_document_id); end if;
  else selected_ids := array_remove(selected_ids,p_document_id); end if;
  return sea_operation_private.set_project_document_selection(p_project_id,selected_ids);
end;
$$;

create function public.set_project_sea_operation_document(p_project_id bigint,p_document_id text,p_selected boolean) returns jsonb
language sql security invoker set search_path = '' as $$ select sea_operation_private.set_project_document_selected(p_project_id,p_document_id,p_selected); $$;
revoke all on function sea_operation_private.set_project_document_selected(bigint,text,boolean),
  public.set_project_sea_operation_document(bigint,text,boolean) from public,anon,authenticated;
grant execute on function sea_operation_private.set_project_document_selected(bigint,text,boolean),
  public.set_project_sea_operation_document(bigint,text,boolean) to authenticated;
comment on function public.set_project_sea_operation_document(bigint,text,boolean) is 'Project managers only: atomically toggle one eligible document, preserving other explicit choices. All documents default to unselected.';
notify pgrst,'reload schema';
