-- Category edits change only canonical metadata. File bytes and source identities stay untouched.
create schema project_document_private;
revoke all on schema project_document_private from public,anon,authenticated,service_role;
grant usage on schema project_document_private to authenticated;

alter table public.project_documents add column subcategory_key text;
alter table public.contract_documents add column subcategory_key text;
alter table public.project_documents add constraint project_documents_subcategory_fkey
  foreign key(company_id,subcategory_key) references public.project_document_categories(company_id,category_key) on delete restrict;
alter table public.contract_documents add constraint contract_documents_subcategory_fkey
  foreign key(company_id,subcategory_key) references public.project_document_categories(company_id,category_key) on delete restrict;

-- The first classification is provenance, not another editable current category.
-- Store false as well: a normal HSE document moved to billing and back is not permanently commercial.
create table project_document_private.original_classifications(
  document_kind text not null check(document_kind in ('generated','project','contract')),
  document_id bigint not null,
  company_id bigint not null references public.companies(id) on delete cascade,
  original_category_key text,
  original_subcategory_key text,
  original_document_type text,
  sea_operation_excluded boolean not null,
  captured_at timestamptz not null default now(),
  primary key(document_kind,document_id)
);
alter table project_document_private.original_classifications enable row level security;
revoke all on project_document_private.original_classifications from public,anon,authenticated,service_role;

-- A refresh may replace imported source metadata, but must not erase a user's classification.
create table project_document_private.classification_overrides(
  document_kind text not null check(document_kind in ('generated','project','contract')),
  document_id bigint not null,
  company_id bigint not null references public.companies(id) on delete cascade,
  category_key text,
  subcategory_key text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key(document_kind,document_id)
);
alter table project_document_private.classification_overrides enable row level security;
revoke all on project_document_private.classification_overrides from public,anon,authenticated,service_role;

create function project_document_private.commercial_category(p_company bigint,p_key text) returns boolean
language sql stable security definer set search_path='' as $$
  with recursive ancestors as (
    select p_key as category_key,category.parent_key,category.label,array[p_key] as visited
    from (select 1) seed left join public.project_document_categories category on category.company_id=p_company and category.category_key=p_key
    union all
    select parent.category_key,parent.parent_key,parent.label,child.visited||parent.category_key
    from ancestors child join public.project_document_categories parent on parent.company_id=p_company and parent.category_key=child.parent_key
    where not parent.category_key=any(child.visited)
  )
  select exists(select 1 from ancestors
    where regexp_replace(public.normalize_import_label(category_key),'[^a-z0-9]','','g') in
      ('commercialoffer','commercialoffers','commercialcontract','commercialcontracts','commercialappendix','billing','offer','offers',
       'contractdocument','contractdocuments','contract','contracts','contrat','contrats')
    or regexp_replace(public.normalize_import_label(label),'[^a-z0-9]','','g') in
      ('offrecommerciale','offrescommerciales','facturation','contrat','contrats','contract','contracts','commercialoffer','commercialoffers'));
$$;
create function project_document_private.was_commercial(p_kind text,p_id bigint) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select origin.sea_operation_excluded from project_document_private.original_classifications origin
    where origin.document_kind=p_kind and origin.document_id=p_id),false);
$$;

create function project_document_private.capture_original_classification() returns trigger
language plpgsql security definer set search_path='' as $$
declare kind text; source jsonb; origin project_document_private.original_classifications; manual project_document_private.classification_overrides;
begin
  kind:=case tg_table_name when 'project_generated_documents' then 'generated' when 'project_documents' then 'project' when 'contract_documents' then 'contract' end;
  if tg_op='INSERT' then source:=to_jsonb(new); else source:=to_jsonb(old); end if;
  select * into origin from project_document_private.original_classifications item where item.document_kind=kind and item.document_id=(source->>'id')::bigint;
  if not found then
    insert into project_document_private.original_classifications(document_kind,document_id,company_id,original_category_key,original_subcategory_key,original_document_type,sea_operation_excluded)
    values(kind,(source->>'id')::bigint,(source->>'company_id')::bigint,source->>'category_key',source->>'subcategory_key',source->>'document_type',
      kind='contract' or kind='generated' and source->>'document_type' not in('operation_attachment','project_attachment')
      or project_document_private.commercial_category((source->>'company_id')::bigint,source->>'category_key')
      or project_document_private.commercial_category((source->>'company_id')::bigint,source->>'subcategory_key'))
    on conflict(document_kind,document_id) do nothing;
    select * into origin from project_document_private.original_classifications item where item.document_kind=kind and item.document_id=(source->>'id')::bigint;
  end if;
  -- Preserve provenance if a privileged legacy importer replaces an identity.
  if new.id is distinct from (source->>'id')::bigint then
    insert into project_document_private.original_classifications(document_kind,document_id,company_id,original_category_key,original_subcategory_key,original_document_type,sea_operation_excluded,captured_at)
    values(kind,new.id,origin.company_id,origin.original_category_key,origin.original_subcategory_key,origin.original_document_type,origin.sea_operation_excluded,origin.captured_at)
    on conflict(document_kind,document_id) do update set sea_operation_excluded=project_document_private.original_classifications.sea_operation_excluded or excluded.sea_operation_excluded;
  end if;
  if tg_op='UPDATE' then
    if current_setting('role')='authenticated' and (select auth.uid()) is not null then
      if old.category_key is distinct from new.category_key or old.subcategory_key is distinct from new.subcategory_key then
        insert into project_document_private.classification_overrides(document_kind,document_id,company_id,category_key,subcategory_key,updated_by)
        values(kind,new.id,new.company_id,new.category_key,new.subcategory_key,(select auth.uid()))
        on conflict(document_kind,document_id) do update set category_key=excluded.category_key,subcategory_key=excluded.subcategory_key,
          updated_by=excluded.updated_by,updated_at=clock_timestamp();
      end if;
    else
      -- Supported SharePoint refreshes use a service identity, never a user's JWT.
      select * into manual from project_document_private.classification_overrides item
        where item.document_kind=kind and item.document_id=old.id and item.company_id=old.company_id;
      if found then
        new.category_key:=manual.category_key; new.subcategory_key:=manual.subcategory_key;
      end if;
    end if;
  end if;
  return new;
end;
$$;
-- AFTER INSERT avoids recording provisional IDs from INSERT ... ON CONFLICT updates.
create trigger project_generated_documents_classification_origin_insert after insert on public.project_generated_documents
  for each row execute function project_document_private.capture_original_classification();
create trigger project_generated_documents_classification_origin before update on public.project_generated_documents
  for each row execute function project_document_private.capture_original_classification();
create trigger project_documents_classification_origin_insert after insert on public.project_documents
  for each row execute function project_document_private.capture_original_classification();
create trigger project_documents_classification_origin before update on public.project_documents
  for each row execute function project_document_private.capture_original_classification();
create trigger contract_documents_classification_origin_insert after insert on public.contract_documents
  for each row execute function project_document_private.capture_original_classification();
create trigger contract_documents_classification_origin before update on public.contract_documents
  for each row execute function project_document_private.capture_original_classification();

insert into project_document_private.original_classifications(document_kind,document_id,company_id,original_category_key,original_subcategory_key,original_document_type,sea_operation_excluded)
select 'generated',document.id,document.company_id,document.category_key,document.subcategory_key,document.document_type,
  document.document_type not in('operation_attachment','project_attachment')
  or project_document_private.commercial_category(document.company_id,document.category_key)
  or project_document_private.commercial_category(document.company_id,document.subcategory_key)
from public.project_generated_documents document
union all
select 'project',document.id,document.company_id,document.category_key,document.subcategory_key,null,
  project_document_private.commercial_category(document.company_id,document.category_key)
from public.project_documents document
union all
select 'contract',document.id,document.company_id,document.category_key,document.subcategory_key,null,true from public.contract_documents document
on conflict(document_kind,document_id) do nothing;

-- Preserve canonical classifications already assigned before this feature existed.
insert into project_document_private.classification_overrides(document_kind,document_id,company_id,category_key,subcategory_key,updated_by)
select 'project',document.id,document.company_id,document.category_key,document.subcategory_key,document.updated_by
from public.project_documents document where document.category_key not in ('project_document','contract_document') or document.subcategory_key is not null
union all
select 'contract',document.id,document.company_id,document.category_key,document.subcategory_key,document.updated_by
from public.contract_documents document where document.category_key not in ('project_document','contract_document') or document.subcategory_key is not null
on conflict(document_kind,document_id) do nothing;

-- New imported subcategories have the same historical hierarchy protection as generated attachments.
create function project_document_private.guard_category_parent() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.parent_key is distinct from new.parent_key and (
    exists(select 1 from public.project_documents document where document.company_id=old.company_id and old.category_key in(document.category_key,document.subcategory_key))
    or exists(select 1 from public.contract_documents document where document.company_id=old.company_id and old.category_key in(document.category_key,document.subcategory_key))
    or exists(select 1 from public.project_generated_documents document where document.company_id=old.company_id and old.category_key in(document.category_key,document.subcategory_key)))
  then raise exception 'Referenced document category hierarchy cannot be changed' using errcode='22023'; end if;
  return new;
end;
$$;
create trigger project_document_categories_referenced_parent before update of parent_key on public.project_document_categories
  for each row execute function project_document_private.guard_category_parent();

alter table public.project_change_log drop constraint project_change_log_entity_type_check;
alter table public.project_change_log add constraint project_change_log_entity_type_check check(entity_type in
  ('clients','projects','project_contracts','project_towed_assets','project_documents','contract_documents','towage_options','project_generated_documents'));

create function project_document_private.category_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare kind text; document_key text;
begin
  if old.category_key is not distinct from new.category_key and old.subcategory_key is not distinct from new.subcategory_key then return new; end if;
  kind:=case tg_table_name when 'project_generated_documents' then 'generated' when 'project_documents' then 'project' else 'contract' end;
  document_key:=kind||':'||new.id::text;
  -- Classification is not consent to expose a document. Rechecking is explicit after an edit.
  update sea_operation_private.project_document_selections selection
    set document_ids=array_remove(selection.document_ids,document_key),updated_at=clock_timestamp(),updated_by=coalesce((select auth.uid()),selection.updated_by)
    where document_key=any(selection.document_ids);
  delete from sea_operation_private.project_document_grants permission where permission.document_id=document_key;
  if kind='generated' then
    insert into public.project_change_log(company_id,entity_type,entity_id,action,changed_by,old_values,new_values)
    values(new.company_id,'project_generated_documents',new.id,'update',(select auth.uid()),
      jsonb_build_object('id',old.id,'project_id',old.project_id,'file_name',old.file_name,'category_key',old.category_key,'subcategory_key',old.subcategory_key),
      jsonb_build_object('id',new.id,'project_id',new.project_id,'file_name',new.file_name,'category_key',new.category_key,'subcategory_key',new.subcategory_key));
  end if;
  return new;
end;
$$;
create trigger project_generated_documents_category_changed after update of category_key,subcategory_key on public.project_generated_documents
  for each row execute function project_document_private.category_changed();
create trigger project_documents_category_changed after update of category_key,subcategory_key on public.project_documents
  for each row execute function project_document_private.category_changed();
create trigger contract_documents_category_changed after update of category_key,subcategory_key on public.contract_documents
  for each row execute function project_document_private.category_changed();

create function project_document_private.set_category(target_project_id bigint,target_document_id text,target_category_key text,target_subcategory_key text,target_expected_category_key text,target_expected_subcategory_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare company bigint:=sea_operation_private.project_document_manager_company(target_project_id); kind text; document_id bigint; snapshot jsonb; current_category text; current_subcategory text;
  category text:=nullif(btrim(target_category_key),''); subcategory text:=nullif(btrim(target_subcategory_key),'');
begin
  perform 1 from public.projects project where project.id=target_project_id and project.company_id=company and project.archived_at is null for update;
  if not found then raise exception 'Un projet clôturé ne peut pas être modifié.' using errcode='42501'; end if;
  if target_document_id is null or target_document_id !~ '^(generated|project|contract):[1-9][0-9]{0,18}$'
    or category is null or category !~ '^[a-z0-9][a-z0-9_-]{2,63}$'
    or subcategory is not null and subcategory !~ '^[a-z0-9][a-z0-9_-]{2,63}$'
  then raise exception 'Le classement du document est invalide.' using errcode='22023'; end if;
  kind:=split_part(target_document_id,':',1);
  begin document_id:=split_part(target_document_id,':',2)::bigint;
  exception when numeric_value_out_of_range then raise exception 'Le document est invalide.' using errcode='22023'; end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('project-document-categories:'||company::text,0));
  if kind='generated' then
    select to_jsonb(document) into snapshot from public.project_generated_documents document where document.id=document_id and document.company_id=company and document.project_id=target_project_id for update;
  elsif kind='project' then
    select to_jsonb(document) into snapshot from public.project_documents document where document.id=document_id and document.company_id=company and document.project_id=target_project_id and not document.is_folder for update;
  else
    select to_jsonb(document) into snapshot from public.contract_documents document where document.id=document_id and document.company_id=company and document.project_id=target_project_id and not document.is_folder for update;
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
      update public.project_generated_documents document set category_key=category,subcategory_key=subcategory where document.id=document_id and document.company_id=company and document.project_id=target_project_id;
    elsif kind='project' then
      update public.project_documents document set category_key=category,subcategory_key=subcategory,updated_by=(select auth.uid()) where document.id=document_id and document.company_id=company and document.project_id=target_project_id;
    else
      update public.contract_documents document set category_key=category,subcategory_key=subcategory,updated_by=(select auth.uid()) where document.id=document_id and document.company_id=company and document.project_id=target_project_id;
    end if;
  end if;
  return jsonb_build_object('project_id',target_project_id::text,'document_id',target_document_id,'category_key',category,'subcategory_key',subcategory);
end;
$$;
create function public.projects_set_document_category(target_project_id bigint,target_document_id text,target_category_key text,target_subcategory_key text,target_expected_category_key text,target_expected_subcategory_key text) returns jsonb
language sql security invoker set search_path='' as $$
  select project_document_private.set_category(target_project_id,target_document_id,target_category_key,target_subcategory_key,target_expected_category_key,target_expected_subcategory_key);
$$;
revoke all on all functions in schema project_document_private from public,anon,authenticated,service_role;
grant execute on function project_document_private.set_category(bigint,text,text,text,text,text) to authenticated;
revoke all on function public.projects_set_document_category(bigint,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.projects_set_document_category(bigint,text,text,text,text,text) to authenticated;

-- Original commercial classifications remain excluded after any relabeling, including aliases.
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
    and not project_document_private.was_commercial('generated',document.id)
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
    and not project_document_private.was_commercial('project',document.id)
    and (document.subcategory_key is null or (subcategory.parent_key=document.category_key and sea_operation_private.project_document_category_eligible(p_company,document.subcategory_key)))
    and sea_operation_private.project_document_category_eligible(p_company,document.category_key);
  -- Commercial generated documents and contract_documents remain excluded by type,
  -- even if a historical row has been relabeled as an operational category.
$$;


create or replace function sea_operation_private.project_document_location(p_project_id bigint,p_document_id text) returns jsonb
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
          or project_document_private.was_commercial('generated',other.id)
          or (other.category_key is not null and not sea_operation_private.document_category_allowed(document.company_id,other.category_key))
          or (other.subcategory_key is not null and not sea_operation_private.document_category_allowed(document.company_id,other.subcategory_key))))
      or exists(select 1 from public.project_documents other where other.file_url = path and (other.company_id <> document.company_id
        or other.project_id is distinct from p_project_id or project_document_private.was_commercial('project',other.id)
        or (other.subcategory_key is not null and not sea_operation_private.document_category_allowed(document.company_id,other.subcategory_key))
        or not sea_operation_private.document_category_allowed(document.company_id,other.category_key)))
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
      or other.project_id is distinct from p_project_id or project_document_private.was_commercial('project',other.id)
      or (other.subcategory_key is not null and not sea_operation_private.document_category_allowed(document.company_id,other.subcategory_key))
      or not sea_operation_private.document_category_allowed(document.company_id,other.category_key)))
    or exists(select 1 from public.project_generated_documents other where other.sharepoint_web_url = path and (other.company_id <> document.company_id
      or other.project_id <> p_project_id or other.document_type not in ('operation_attachment','project_attachment')
          or project_document_private.was_commercial('generated',other.id)
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


comment on function public.projects_set_document_category(bigint,text,text,text,text,text) is 'Project managers: change one document classification with optimistic concurrency; files and intrinsic commercial provenance stay unchanged.';
notify pgrst,'reload schema';
