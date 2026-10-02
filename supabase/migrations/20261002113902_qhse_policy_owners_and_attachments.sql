-- Additive structured ownership and private immutable follow-up evidence.
alter table public.qhse_policy_objectives
  add column owner_kind text check(owner_kind in ('person','vessel','office')),
  add column owner_person_id bigint references public.people(id) on delete restrict,
  add column owner_vessel_id bigint references public.vessels(id) on delete restrict,
  add constraint qhse_policy_owner_shape check(coalesce(
    (owner_kind is null and owner_person_id is null and owner_vessel_id is null)
    or (owner_kind='person' and owner_person_id is not null and owner_vessel_id is null)
    or (owner_kind='vessel' and owner_person_id is null and owner_vessel_id is not null)
    or (owner_kind='office' and owner_person_id is null and owner_vessel_id is null and length(btrim(owner_label))>0),false));
create index qhse_policy_objectives_owner_person_idx on public.qhse_policy_objectives(owner_person_id);
create index qhse_policy_objectives_owner_vessel_idx on public.qhse_policy_objectives(owner_vessel_id);
alter table public.qhse_policy_objective_updates add column owner_label text not null default '';
alter table public.qhse_policy_objective_updates add constraint qhse_policy_updates_id_company_objective_key unique(id,company_id,objective_id);

create function qhse_policy_private.snapshot_owner() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  select o.owner_label into new.owner_label from public.qhse_policy_objectives o where o.id=new.objective_id and o.company_id=new.company_id;
  return new;
end $$;
revoke all on function qhse_policy_private.snapshot_owner() from public,anon,authenticated;
create trigger qhse_policy_updates_snapshot_owner before insert on public.qhse_policy_objective_updates for each row execute function qhse_policy_private.snapshot_owner();

create function qhse_policy_private.owner_options() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); today_date date:=(now() at time zone 'Europe/Paris')::date; people jsonb; vessels jsonb;
begin
  if not qhse_policy_private.can_access(company,true) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  -- RH En poste uses hire/departure dates, not people.active: a future hire and
  -- someone leaving today are excluded, an employed active=false record is kept.
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'label',btrim(p.first_name||' '||p.last_name)) order by p.last_name,p.first_name,p.id),'[]'::jsonb)
  into people from public.people p where p.company_id=company and p.hired_on is not null and p.hired_on<=today_date and (p.departed_on is null or p.departed_on>today_date);
  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'label',v.name,'length_overall',v.length_overall) order by v.id),'[]'::jsonb)
  into vessels from public.vessels v where v.company_id=company and v.active and v.asset_kind='vessel';
  return jsonb_build_object('people',people,'vessels',vessels);
end $$;
create function public.qhse_policy_owner_options() returns jsonb language sql security invoker set search_path='' as $$select qhse_policy_private.owner_options();$$;

create function qhse_policy_private.save_objective(p_id uuid,p_process_id uuid,p_title text,p_description text,p_owner_label text,p_due_on date,p_initial_progress numeric,p_expected_revision integer,p_owner_kind text,p_owner_person_id bigint,p_owner_vessel_id bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); target public.qhse_policy_objectives; process public.qhse_policy_processes; target_id uuid; label text; kind text:=p_owner_kind; person_id bigint:=p_owner_person_id; vessel_id bigint:=p_owner_vessel_id; today_date date:=(now() at time zone 'Europe/Paris')::date;
begin
  if not qhse_policy_private.can_access(company,true) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 250 or length(coalesce(p_description,''))>10000 or length(coalesce(p_owner_label,''))>200
    or (p_due_on is not null and (not isfinite(p_due_on) or p_due_on not between '1900-01-01'::date and '2100-12-31'::date))
    or (p_id is null and (p_initial_progress is null or p_initial_progress not between 0 and 100 or p_initial_progress<>round(p_initial_progress,2)))
    or (p_id is not null and p_initial_progress is not null) then raise exception 'QHSE_POLICY_INVALID' using errcode='22023'; end if;
  select * into process from public.qhse_policy_processes where id=p_process_id and company_id=company for update;
  if process.id is null then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  if process.archived then raise exception 'QHSE_POLICY_ARCHIVED' using errcode='22023'; end if;
  if p_id is not null then
    select * into target from public.qhse_policy_objectives where id=p_id and company_id=company for update;
    if target.id is null then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
    if target.revision is distinct from p_expected_revision then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
    if target.archived then raise exception 'QHSE_POLICY_ARCHIVED' using errcode='22023'; end if;
  elsif p_expected_revision is not null then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
  if kind is null and p_id is not null and person_id is null and vessel_id is null then
    -- Older clients and legacy free-text records retain their assignment on edit.
    kind:=target.owner_kind; person_id:=target.owner_person_id; vessel_id:=target.owner_vessel_id; label:=target.owner_label;
  elsif p_id is not null and kind in ('person','vessel') and kind is not distinct from target.owner_kind and person_id is not distinct from target.owner_person_id and vessel_id is not distinct from target.owner_vessel_id then
    label:=target.owner_label;
  elsif kind='person' and person_id is not null and vessel_id is null then
    select btrim(p.first_name||' '||p.last_name) into label from public.people p where p.id=person_id and p.company_id=company and p.hired_on is not null and p.hired_on<=today_date and (p.departed_on is null or p.departed_on>today_date) for share;
    if label is null then raise exception 'QHSE_POLICY_INVALID_OWNER' using errcode='22023'; end if;
  elsif kind='vessel' and person_id is null and vessel_id is not null then
    select 'Équipages '||v.name into label from public.vessels v where v.id=vessel_id and v.company_id=company and v.active and v.asset_kind='vessel' for share;
    if label is null then raise exception 'QHSE_POLICY_INVALID_OWNER' using errcode='22023'; end if;
  elsif kind='office' and person_id is null and vessel_id is null and length(btrim(coalesce(p_owner_label,''))) between 1 and 200 then label:=btrim(p_owner_label);
  else raise exception 'QHSE_POLICY_INVALID_OWNER' using errcode='22023'; end if;
  if length(label)>200 then raise exception 'QHSE_POLICY_INVALID_OWNER' using errcode='22023'; end if;
  if p_id is null then
    insert into public.qhse_policy_objectives(company_id,process_id,title,description,owner_kind,owner_person_id,owner_vessel_id,owner_label,due_on,progress,created_by,updated_by)
    values(company,p_process_id,btrim(p_title),btrim(coalesce(p_description,'')),kind,person_id,vessel_id,label,p_due_on,p_initial_progress,auth.uid(),auth.uid()) returning id into target_id;
    insert into public.qhse_policy_objective_updates(company_id,objective_id,kind,progress,occurred_on,note,actor_id,actor_name)
    values(company,target_id,'initial',p_initial_progress,today_date,'État initial',auth.uid(),qhse_policy_private.actor_name());
  else
    update public.qhse_policy_objectives set process_id=p_process_id,title=btrim(p_title),description=btrim(coalesce(p_description,'')),owner_kind=kind,owner_person_id=person_id,owner_vessel_id=vessel_id,owner_label=label,due_on=p_due_on,
      revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id returning id into target_id;
  end if;
  return target_id;
end $$;
-- Keep old clients safe: nonempty free text is a bureau on creation; edits retain
-- existing responsibility. Blank new owners cannot bypass the new requirement.
create or replace function qhse_policy_private.save_objective(p_id uuid,p_process_id uuid,p_title text,p_description text,p_owner_label text,p_due_on date,p_initial_progress numeric,p_expected_revision integer)
returns uuid language sql security definer set search_path='' as $$select qhse_policy_private.save_objective(p_id,p_process_id,p_title,p_description,p_owner_label,p_due_on,p_initial_progress,p_expected_revision,case when p_id is null then 'office' else null end,null,null);$$;
create function public.qhse_policy_save_objective(p_id uuid,p_process_id uuid,p_title text,p_description text,p_owner_label text,p_due_on date,p_initial_progress numeric,p_expected_revision integer,p_owner_kind text,p_owner_person_id bigint,p_owner_vessel_id bigint)
returns uuid language sql security invoker set search_path='' as $$select qhse_policy_private.save_objective(p_id,p_process_id,p_title,p_description,p_owner_label,p_due_on,p_initial_progress,p_expected_revision,p_owner_kind,p_owner_person_id,p_owner_vessel_id);$$;

create table qhse_policy_private.uploads (
  id uuid primary key default gen_random_uuid(), company_id bigint not null references public.companies(id) on delete restrict,
  objective_id uuid not null, actor_id uuid not null references public.profiles(id) on delete restrict,
  file_name text not null, mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 26214400),
  storage_path text not null unique, created_at timestamptz not null default clock_timestamp(), finalized boolean not null default false,
  foreign key(objective_id,company_id) references public.qhse_policy_objectives(id,company_id) on delete restrict
);
alter table qhse_policy_private.uploads enable row level security;
revoke all on qhse_policy_private.uploads from public,anon,authenticated;
create index qhse_policy_uploads_actor_idx on qhse_policy_private.uploads(actor_id);
create index qhse_policy_uploads_objective_idx on qhse_policy_private.uploads(objective_id,company_id);
create table public.qhse_policy_attachments (
  id uuid primary key references qhse_policy_private.uploads(id) on delete restrict,
  company_id bigint not null references public.companies(id) on delete restrict, objective_id uuid not null, update_id uuid not null,
  file_name text not null, mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 26214400),
  storage_bucket text not null default 'qhse-policy-attachments' check(storage_bucket='qhse-policy-attachments'), storage_path text not null unique,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(update_id,company_id,objective_id) references public.qhse_policy_objective_updates(id,company_id,objective_id) on delete restrict
);
create index qhse_policy_attachments_update_idx on public.qhse_policy_attachments(update_id,company_id,objective_id);
create index qhse_policy_attachments_company_idx on public.qhse_policy_attachments(company_id);
alter table public.qhse_policy_attachments enable row level security;
revoke all on public.qhse_policy_attachments from public,anon,authenticated;
grant select on public.qhse_policy_attachments to authenticated;
create policy qhse_policy_attachments_read on public.qhse_policy_attachments for select to authenticated using(qhse_policy_private.can_access(company_id));
create trigger qhse_policy_attachments_immutable before update or delete on public.qhse_policy_attachments for each row execute function qhse_policy_private.immutable_history();

create function qhse_policy_private.file_mime(p_name text) returns text language sql immutable security invoker set search_path='' as $$
select case lower(substring(p_name from '[.]([^.]+)$'))
 when 'pdf' then 'application/pdf' when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'webp' then 'image/webp' when 'gif' then 'image/gif'
 when 'doc' then 'application/msword' when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
 when 'xls' then 'application/vnd.ms-excel' when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 when 'ppt' then 'application/vnd.ms-powerpoint' when 'pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
 when 'odt' then 'application/vnd.oasis.opendocument.text' when 'ods' then 'application/vnd.oasis.opendocument.spreadsheet' when 'odp' then 'application/vnd.oasis.opendocument.presentation'
 when 'txt' then 'text/plain' when 'csv' then 'text/csv' else null end;
$$;
create function qhse_policy_private.prepare_attachments(p_objective_id uuid,p_files jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); item jsonb; token uuid; filename text; mimetype text; filesize bigint; path text; result jsonb:='[]'::jsonb;
begin
  if not qhse_policy_private.can_access(company,true) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  if not exists(select 1 from public.qhse_policy_objectives o join public.qhse_policy_processes p on p.id=o.process_id where o.id=p_objective_id and o.company_id=company and not o.archived and not p.archived) then raise exception 'QHSE_POLICY_INVALID' using errcode='22023'; end if;
  if jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files) not between 1 and 10 then raise exception 'QHSE_POLICY_INVALID_FILES' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_files) loop
    filename:=btrim(item->>'file_name'); mimetype:=qhse_policy_private.file_mime(filename);
    if jsonb_typeof(item) is distinct from 'object' or filename is null or length(filename) not between 1 and 200 or filename ~ E'[\\\\/[:cntrl:]]' or mimetype is null or mimetype is distinct from item->>'mime_type'
      or coalesce(item->>'size_bytes','') !~ '^[0-9]{1,8}$' then raise exception 'QHSE_POLICY_INVALID_FILES' using errcode='22023'; end if;
    filesize:=(item->>'size_bytes')::bigint;
    if filesize not between 1 and 26214400 then raise exception 'QHSE_POLICY_INVALID_FILES' using errcode='22023'; end if;
    token:=gen_random_uuid(); path:=company::text||'/'||p_objective_id::text||'/'||token::text||'.'||lower(substring(filename from '[.]([^.]+)$'));
    insert into qhse_policy_private.uploads(id,company_id,objective_id,actor_id,file_name,mime_type,size_bytes,storage_path) values(token,company,p_objective_id,auth.uid(),filename,mimetype,filesize,path);
    result:=result||jsonb_build_array(jsonb_build_object('id',token,'storage_path',path,'file_name',filename,'mime_type',mimetype,'size_bytes',filesize));
  end loop;
  return result;
end $$;
create function public.qhse_policy_prepare_attachments(p_objective_id uuid,p_files jsonb) returns jsonb language sql security invoker set search_path='' as $$select qhse_policy_private.prepare_attachments(p_objective_id,p_files);$$;

-- Restrictive bucket policies below block unrelated broad policies from granting
-- writes. UPDATE has no allowance, so finalized or staging objects cannot be replaced.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('qhse-policy-attachments','qhse-policy-attachments',false,26214400,array['application/pdf','image/png','image/jpeg','image/webp','image/gif','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet','application/vnd.oasis.opendocument.presentation','text/plain','text/csv']);
create function qhse_policy_private.storage_access(p_path text,p_operation text) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare stage qhse_policy_private.uploads;
begin
  if p_operation='read' and exists(select 1 from public.qhse_policy_attachments a where a.storage_path=p_path and qhse_policy_private.can_access(a.company_id)) then return true; end if;
  if p_operation='delete' then
    -- Serialize cleanup with finalization. An in-flight cleanup rechecks the
    -- finalized flag after acquiring this row lock and cannot erase committed evidence.
    select * into stage from qhse_policy_private.uploads where storage_path=p_path for update;
  else select * into stage from qhse_policy_private.uploads where storage_path=p_path; end if;
  return stage.id is not null and stage.actor_id=auth.uid() and not stage.finalized and qhse_policy_private.can_access(stage.company_id,true)
    and (p_operation<>'insert' or stage.created_at>clock_timestamp()-interval '24 hours')
    and (p_operation<>'insert' or exists(select 1 from public.qhse_policy_objectives o join public.qhse_policy_processes p on p.id=o.process_id where o.id=stage.objective_id and not o.archived and not p.archived));
end $$;
create policy qhse_policy_storage_read on storage.objects for select to authenticated using(bucket_id='qhse-policy-attachments' and qhse_policy_private.storage_access(name,'read'));
create policy qhse_policy_storage_insert on storage.objects for insert to authenticated with check(bucket_id='qhse-policy-attachments' and qhse_policy_private.storage_access(name,'insert') and owner_id=auth.uid()::text);
create policy qhse_policy_storage_delete on storage.objects for delete to authenticated using(bucket_id='qhse-policy-attachments' and qhse_policy_private.storage_access(name,'delete'));
create policy qhse_policy_storage_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'qhse-policy-attachments' or qhse_policy_private.storage_access(name,'read'));
create policy qhse_policy_storage_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'qhse-policy-attachments' or (qhse_policy_private.storage_access(name,'insert') and owner_id=auth.uid()::text));
create policy qhse_policy_storage_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id<>'qhse-policy-attachments') with check(bucket_id<>'qhse-policy-attachments');
create policy qhse_policy_storage_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'qhse-policy-attachments' or qhse_policy_private.storage_access(name,'delete'));

create function qhse_policy_private.add_update_with_attachments(p_objective_id uuid,p_progress numeric,p_occurred_on date,p_note text,p_expected_revision integer,p_upload_ids uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); stage qhse_policy_private.uploads; token uuid; object_row storage.objects; update_id uuid;
begin
  if not qhse_policy_private.can_access(company,true) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  if p_upload_ids is null or cardinality(p_upload_ids)>10 or cardinality(p_upload_ids)<>(select count(distinct u) from unnest(p_upload_ids) u) then raise exception 'QHSE_POLICY_INVALID_FILES' using errcode='22023'; end if;
  -- All validation and the original revision-checked history write are one transaction.
  for token in select value from unnest(p_upload_ids) value order by value loop
    select * into stage from qhse_policy_private.uploads where id=token for update;
    if stage.id is null or stage.company_id<>company or stage.objective_id<>p_objective_id or stage.actor_id<>auth.uid() or stage.finalized or stage.created_at<=clock_timestamp()-interval '24 hours' then raise exception 'QHSE_POLICY_INVALID_UPLOAD' using errcode='22023'; end if;
    select * into object_row from storage.objects where bucket_id='qhse-policy-attachments' and name=stage.storage_path for share;
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
end $$;
create function public.qhse_policy_add_objective_update_with_attachments(p_objective_id uuid,p_progress numeric,p_occurred_on date,p_note text,p_expected_revision integer,p_upload_ids uuid[])
returns uuid language sql security invoker set search_path='' as $$select qhse_policy_private.add_update_with_attachments(p_objective_id,p_progress,p_occurred_on,p_note,p_expected_revision,p_upload_ids);$$;

-- Published PDFs are selected by ID; legacy URL settings remain readable but new
-- arbitrary URL writes are no longer accepted. Default chapter 02 is a UI choice.
create or replace function qhse_policy_private.save_settings(p_publication_id bigint,p_document_url text,p_expected_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); target public.qhse_policy_settings;
begin
  if not qhse_policy_private.can_access(company,true) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  if btrim(coalesce(p_document_url,''))<>'' or (p_publication_id is not null and not exists(select 1 from public.published_procedures p where p.id=p_publication_id
      and p.status='published' and lower(coalesce(p.mime_type,''))='application/pdf' and lower(coalesce(p.file_name,'')) like '%.pdf'
      and ((p.google_drive_path is not null and p.drive_sha256 is not null) or (p.storage_bucket='procedure-documents' and p.storage_path like 'published/%')))) then raise exception 'QHSE_POLICY_INVALID_DOCUMENT' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(company::text||':qhse-policy-settings',0));
  select * into target from public.qhse_policy_settings where company_id=company for update;
  if target.company_id is null then
    if p_expected_revision is not null then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
    insert into public.qhse_policy_settings(company_id,publication_id,document_url,updated_by) values(company,p_publication_id,'',auth.uid());
  else
    if target.revision is distinct from p_expected_revision then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
    update public.qhse_policy_settings set publication_id=p_publication_id,document_url='',revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() where company_id=company;
  end if;
end $$;

-- Extend the previous invoker snapshot without exposing HR fields to readers.
create or replace function public.qhse_policy_snapshot() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); settings jsonb; processes jsonb; objectives jsonb; updates jsonb; attachments jsonb;
begin
  if not qhse_policy_private.can_access(company) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  select jsonb_build_object('publication_id',s.publication_id,'document_url',s.document_url,'revision',s.revision,'updated_at',s.updated_at) into settings from public.qhse_policy_settings s where s.company_id=company;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'position',p.position,'archived',p.archived,'revision',p.revision,'updated_at',p.updated_at) order by p.position,p.name,p.id),'[]'::jsonb) into processes from public.qhse_policy_processes p where p.company_id=company;
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'process_id',o.process_id,'title',o.title,'description',o.description,'owner_kind',o.owner_kind,'owner_person_id',o.owner_person_id,'owner_vessel_id',o.owner_vessel_id,'owner_label',o.owner_label,'due_on',o.due_on,'progress',o.progress,'archived',o.archived,'revision',o.revision,'created_at',o.created_at,'updated_at',o.updated_at) order by o.created_at,o.id),'[]'::jsonb) into objectives from public.qhse_policy_objectives o where o.company_id=company;
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'objective_id',u.objective_id,'kind',u.kind,'progress',u.progress,'occurred_on',u.occurred_on,'note',u.note,'actor_name',u.actor_name,'owner_label',u.owner_label,'created_at',u.created_at) order by u.created_at desc,u.id desc),'[]'::jsonb) into updates from public.qhse_policy_objective_updates u where u.company_id=company;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'objective_id',a.objective_id,'update_id',a.update_id,'file_name',a.file_name,'mime_type',a.mime_type,'size_bytes',a.size_bytes,'storage_bucket',a.storage_bucket,'storage_path',a.storage_path,'created_at',a.created_at) order by a.created_at,a.id),'[]'::jsonb) into attachments from public.qhse_policy_attachments a where a.company_id=company;
  return jsonb_build_object('settings',settings,'processes',processes,'objectives',objectives,'updates',updates,'attachments',attachments,'can_edit',qhse_policy_private.can_access(company,true));
end $$;
revoke all on function qhse_policy_private.owner_options(),qhse_policy_private.save_objective(uuid,uuid,text,text,text,date,numeric,integer,text,bigint,bigint),qhse_policy_private.file_mime(text),qhse_policy_private.prepare_attachments(uuid,jsonb),qhse_policy_private.storage_access(text,text),qhse_policy_private.add_update_with_attachments(uuid,numeric,date,text,integer,uuid[]) from public,anon;
grant execute on function qhse_policy_private.owner_options(),qhse_policy_private.save_objective(uuid,uuid,text,text,text,date,numeric,integer,text,bigint,bigint),qhse_policy_private.prepare_attachments(uuid,jsonb),qhse_policy_private.storage_access(text,text),qhse_policy_private.add_update_with_attachments(uuid,numeric,date,text,integer,uuid[]) to authenticated;
revoke all on function qhse_policy_private.file_mime(text) from authenticated;
revoke all on function public.qhse_policy_owner_options(),public.qhse_policy_save_objective(uuid,uuid,text,text,text,date,numeric,integer,text,bigint,bigint),public.qhse_policy_prepare_attachments(uuid,jsonb),public.qhse_policy_add_objective_update_with_attachments(uuid,numeric,date,text,integer,uuid[]) from public,anon;
grant execute on function public.qhse_policy_owner_options(),public.qhse_policy_save_objective(uuid,uuid,text,text,text,date,numeric,integer,text,bigint,bigint),public.qhse_policy_prepare_attachments(uuid,jsonb),public.qhse_policy_add_objective_update_with_attachments(uuid,numeric,date,text,integer,uuid[]) to authenticated;
notify pgrst,'reload schema';
