-- Company-scoped policy objectives. No policy text, document or objective is invented.
insert into public.role_module_permissions(role_key,module_key,is_visible)
select key,'qhsePolicy',true from public.roles on conflict(role_key,module_key) do nothing;

create schema qhse_policy_private;
revoke all on schema qhse_policy_private from public,anon;
grant usage on schema qhse_policy_private to authenticated;

create function qhse_policy_private.can_access(p_company_id bigint,p_manage boolean default false)
returns boolean language sql stable security invoker set search_path='' as $$
  select auth.uid() is not null and p_company_id=public.current_planning_company_id()
    and public.user_belongs_to_company(p_company_id)
    and exists(select 1 from public.companies c where c.id=p_company_id and c.active)
    and exists(select 1 from public.user_roles r join public.role_module_permissions m on m.role_key=r.role_key
      where r.user_id=auth.uid() and r.company_id=p_company_id and m.module_key='qhsePolicy' and m.is_visible)
    and (not p_manage or public.has_any_role(array['admin','direction']));
$$;
revoke all on function qhse_policy_private.can_access(bigint,boolean) from public,anon;
grant execute on function qhse_policy_private.can_access(bigint,boolean) to authenticated;

create table public.qhse_policy_settings (
  company_id bigint primary key references public.companies(id) on delete restrict,
  publication_id bigint references public.published_procedures(id) on delete restrict,
  document_url text not null default '' check(document_url='' or document_url ~ '^https://drive[.]google[.]com/file/d/[A-Za-z0-9_-]{10,200}/view$'),
  revision integer not null default 1 check(revision>0),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references public.profiles(id) on delete set null,
  check(publication_id is null or document_url='')
);
create index qhse_policy_settings_publication_idx on public.qhse_policy_settings(publication_id);
create index qhse_policy_settings_author_idx on public.qhse_policy_settings(updated_by);
create table public.qhse_policy_processes (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id) on delete restrict,
  name text not null check(length(btrim(name)) between 1 and 200),
  description text not null default '' check(length(description)<=5000),
  position integer not null default 0 check(position between 0 and 100000),
  archived boolean not null default false,
  revision integer not null default 1 check(revision>0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique(id,company_id)
);
create unique index qhse_policy_processes_name_idx on public.qhse_policy_processes(company_id,lower(btrim(name))) where not archived;
create index qhse_policy_processes_company_position_idx on public.qhse_policy_processes(company_id,position);
create index qhse_policy_processes_created_by_idx on public.qhse_policy_processes(created_by);
create index qhse_policy_processes_updated_by_idx on public.qhse_policy_processes(updated_by);
create table public.qhse_policy_objectives (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id) on delete restrict,
  process_id uuid not null,
  title text not null check(length(btrim(title)) between 1 and 250),
  description text not null default '' check(length(description)<=10000),
  owner_label text not null default '' check(length(owner_label)<=200),
  due_on date check(isfinite(due_on) and due_on between '1900-01-01'::date and '2100-12-31'::date),
  progress numeric(5,2) not null default 0 check(progress between 0 and 100),
  archived boolean not null default false,
  revision integer not null default 1 check(revision>0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique(id,company_id),
  foreign key(process_id,company_id) references public.qhse_policy_processes(id,company_id) on delete restrict
);
create index qhse_policy_objectives_process_idx on public.qhse_policy_objectives(process_id,company_id);
create index qhse_policy_objectives_company_due_idx on public.qhse_policy_objectives(company_id,due_on);
create index qhse_policy_objectives_created_by_idx on public.qhse_policy_objectives(created_by);
create index qhse_policy_objectives_updated_by_idx on public.qhse_policy_objectives(updated_by);
create table public.qhse_policy_objective_updates (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id) on delete restrict,
  objective_id uuid not null,
  kind text not null check(kind in ('initial','progress')),
  progress numeric(5,2) not null check(progress between 0 and 100),
  occurred_on date not null check(isfinite(occurred_on) and occurred_on between '1900-01-01'::date and '2100-12-31'::date),
  note text not null check(length(btrim(note)) between 1 and 10000),
  actor_id uuid not null,
  actor_name text not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(objective_id,company_id) references public.qhse_policy_objectives(id,company_id) on delete restrict
);
create index qhse_policy_updates_objective_idx on public.qhse_policy_objective_updates(objective_id,company_id,created_at desc);
create index qhse_policy_updates_company_idx on public.qhse_policy_objective_updates(company_id,created_at desc);
comment on column public.qhse_policy_objective_updates.actor_id is 'Immutable Auth identity snapshot retained after an account is removed; no cascading mutation of audit history.';

create function qhse_policy_private.immutable_history()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'QHSE_POLICY_HISTORY_IMMUTABLE' using errcode='42501'; end $$;
revoke all on function qhse_policy_private.immutable_history() from public,anon,authenticated;
create trigger qhse_policy_updates_immutable before update or delete on public.qhse_policy_objective_updates
for each row execute function qhse_policy_private.immutable_history();

alter table public.qhse_policy_settings enable row level security;
alter table public.qhse_policy_processes enable row level security;
alter table public.qhse_policy_objectives enable row level security;
alter table public.qhse_policy_objective_updates enable row level security;
revoke all on public.qhse_policy_settings,public.qhse_policy_processes,public.qhse_policy_objectives,public.qhse_policy_objective_updates from public,anon,authenticated;
grant select on public.qhse_policy_settings,public.qhse_policy_processes,public.qhse_policy_objectives,public.qhse_policy_objective_updates to authenticated;
create policy qhse_policy_settings_read on public.qhse_policy_settings for select to authenticated using(qhse_policy_private.can_access(company_id));
create policy qhse_policy_processes_read on public.qhse_policy_processes for select to authenticated using(qhse_policy_private.can_access(company_id));
create policy qhse_policy_objectives_read on public.qhse_policy_objectives for select to authenticated using(qhse_policy_private.can_access(company_id));
create policy qhse_policy_updates_read on public.qhse_policy_objective_updates for select to authenticated using(qhse_policy_private.can_access(company_id));

-- The unexposed definer functions below are the only write path, ensuring revision
-- checks and current progress/history always change in one transaction.
create function qhse_policy_private.actor_name()
returns text language sql stable security invoker set search_path='' as $$
  select coalesce(nullif(btrim(p.display_name),''),'Utilisateur') from public.profiles p where p.id=auth.uid();
$$;
revoke all on function qhse_policy_private.actor_name() from public,anon,authenticated;

create function qhse_policy_private.save_process(p_id uuid,p_name text,p_description text,p_position integer,p_expected_revision integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); target public.qhse_policy_processes; target_id uuid;
begin
  if not qhse_policy_private.can_access(company,true) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 200 or length(coalesce(p_description,''))>5000
    or p_position is null or p_position not between 0 and 100000 then raise exception 'QHSE_POLICY_INVALID' using errcode='22023'; end if;
  if p_id is null then
    if p_expected_revision is not null then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
    insert into public.qhse_policy_processes(company_id,name,description,position,created_by,updated_by)
    values(company,btrim(p_name),btrim(coalesce(p_description,'')),p_position,auth.uid(),auth.uid()) returning id into target_id;
  else
    select * into target from public.qhse_policy_processes where id=p_id and company_id=company for update;
    if target.id is null then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
    if target.revision is distinct from p_expected_revision then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
    if target.archived then raise exception 'QHSE_POLICY_ARCHIVED' using errcode='22023'; end if;
    update public.qhse_policy_processes set name=btrim(p_name),description=btrim(coalesce(p_description,'')),position=p_position,
      revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id returning id into target_id;
  end if;
  return target_id;
end $$;

create function qhse_policy_private.archive_process(p_id uuid,p_archived boolean,p_expected_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); target public.qhse_policy_processes;
begin
  if not qhse_policy_private.can_access(company,true) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  select * into target from public.qhse_policy_processes where id=p_id and company_id=company for update;
  if target.id is null then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  if target.revision is distinct from p_expected_revision then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
  if p_archived is null then raise exception 'QHSE_POLICY_INVALID' using errcode='22023'; end if;
  update public.qhse_policy_processes set archived=p_archived,revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id;
end $$;

create function qhse_policy_private.save_objective(p_id uuid,p_process_id uuid,p_title text,p_description text,p_owner_label text,p_due_on date,p_initial_progress numeric,p_expected_revision integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); target public.qhse_policy_objectives; process public.qhse_policy_processes; target_id uuid;
begin
  if not qhse_policy_private.can_access(company,true) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 250 or length(coalesce(p_description,''))>10000 or length(coalesce(p_owner_label,''))>200
    or (p_due_on is not null and (not isfinite(p_due_on) or p_due_on not between '1900-01-01'::date and '2100-12-31'::date))
    or (p_id is null and (p_initial_progress is null or p_initial_progress not between 0 and 100 or p_initial_progress<>round(p_initial_progress,2)))
    or (p_id is not null and p_initial_progress is not null) then raise exception 'QHSE_POLICY_INVALID' using errcode='22023'; end if;
  -- Process lock first also serializes against process archival.
  select * into process from public.qhse_policy_processes where id=p_process_id and company_id=company for update;
  if process.id is null then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  if process.archived then raise exception 'QHSE_POLICY_ARCHIVED' using errcode='22023'; end if;
  if p_id is null then
    if p_expected_revision is not null then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
    insert into public.qhse_policy_objectives(company_id,process_id,title,description,owner_label,due_on,progress,created_by,updated_by)
    values(company,p_process_id,btrim(p_title),btrim(coalesce(p_description,'')),btrim(coalesce(p_owner_label,'')),p_due_on,p_initial_progress,auth.uid(),auth.uid()) returning id into target_id;
    insert into public.qhse_policy_objective_updates(company_id,objective_id,kind,progress,occurred_on,note,actor_id,actor_name)
    values(company,target_id,'initial',p_initial_progress,(now() at time zone 'Europe/Paris')::date,'État initial',auth.uid(),qhse_policy_private.actor_name());
  else
    select * into target from public.qhse_policy_objectives where id=p_id and company_id=company for update;
    if target.id is null then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
    if target.revision is distinct from p_expected_revision then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
    if target.archived then raise exception 'QHSE_POLICY_ARCHIVED' using errcode='22023'; end if;
    update public.qhse_policy_objectives set process_id=p_process_id,title=btrim(p_title),description=btrim(coalesce(p_description,'')),owner_label=btrim(coalesce(p_owner_label,'')),due_on=p_due_on,
      revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id returning id into target_id;
  end if;
  return target_id;
end $$;

create function qhse_policy_private.archive_objective(p_id uuid,p_archived boolean,p_expected_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); target public.qhse_policy_objectives;
begin
  if not qhse_policy_private.can_access(company,true) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  select * into target from public.qhse_policy_objectives where id=p_id and company_id=company for update;
  if target.id is null then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  if target.revision is distinct from p_expected_revision then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
  if p_archived is null then raise exception 'QHSE_POLICY_INVALID' using errcode='22023'; end if;
  update public.qhse_policy_objectives set archived=p_archived,revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id;
end $$;

create function qhse_policy_private.add_objective_update(p_objective_id uuid,p_progress numeric,p_occurred_on date,p_note text,p_expected_revision integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); target public.qhse_policy_objectives; process public.qhse_policy_processes; target_id uuid; v_process_id uuid;
begin
  if not qhse_policy_private.can_access(company,true) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  if p_progress is null or p_progress not between 0 and 100 or p_progress<>round(p_progress,2)
    or p_occurred_on is null or not isfinite(p_occurred_on) or p_occurred_on not between '1900-01-01'::date and (now() at time zone 'Europe/Paris')::date
    or p_note is null or length(btrim(p_note)) not between 1 and 10000 then raise exception 'QHSE_POLICY_INVALID' using errcode='22023'; end if;
  select o.process_id into v_process_id from public.qhse_policy_objectives o where o.id=p_objective_id and o.company_id=company;
  select * into process from public.qhse_policy_processes where id=v_process_id and company_id=company for update;
  if process.id is null then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  select * into target from public.qhse_policy_objectives where id=p_objective_id and company_id=company for update;
  if target.id is null then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  if target.revision is distinct from p_expected_revision or target.process_id is distinct from v_process_id then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
  if target.archived or process.archived then raise exception 'QHSE_POLICY_ARCHIVED' using errcode='22023'; end if;
  update public.qhse_policy_objectives set progress=p_progress,revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_objective_id;
  insert into public.qhse_policy_objective_updates(company_id,objective_id,kind,progress,occurred_on,note,actor_id,actor_name)
  values(company,p_objective_id,'progress',p_progress,p_occurred_on,btrim(p_note),auth.uid(),qhse_policy_private.actor_name()) returning id into target_id;
  return target_id;
end $$;

create function qhse_policy_private.save_settings(p_publication_id bigint,p_document_url text,p_expected_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); target public.qhse_policy_settings; v_document_url text:=btrim(coalesce(p_document_url,''));
begin
  if not qhse_policy_private.can_access(company,true) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  if (v_document_url<>'' and v_document_url !~ '^https://drive[.]google[.]com/file/d/[A-Za-z0-9_-]{10,200}/view$') or (p_publication_id is not null and v_document_url<>'')
    or (p_publication_id is not null and not exists(select 1 from public.published_procedures p where p.id=p_publication_id
      and p.status='published' and p.ism_chapter ~ '^\s*02(\D|$)' and lower(coalesce(p.mime_type,''))='application/pdf'
      and lower(coalesce(p.file_name,'')) like '%.pdf' and ((p.google_drive_path is not null and p.drive_sha256 is not null)
        or (p.storage_bucket='procedure-documents' and p.storage_path like 'published/%')))) then raise exception 'QHSE_POLICY_INVALID_DOCUMENT' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(company::text||':qhse-policy-settings',0));
  select * into target from public.qhse_policy_settings where company_id=company for update;
  if target.company_id is null then
    if p_expected_revision is not null then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
    insert into public.qhse_policy_settings(company_id,publication_id,document_url,updated_by) values(company,p_publication_id,v_document_url,auth.uid());
  else
    if target.revision is distinct from p_expected_revision then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
    update public.qhse_policy_settings set publication_id=p_publication_id,document_url=v_document_url,revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() where company_id=company;
  end if;
end $$;

revoke all on all functions in schema qhse_policy_private from public,anon;
grant execute on function qhse_policy_private.save_process(uuid,text,text,integer,integer),qhse_policy_private.archive_process(uuid,boolean,integer),
  qhse_policy_private.save_objective(uuid,uuid,text,text,text,date,numeric,integer),qhse_policy_private.archive_objective(uuid,boolean,integer),
  qhse_policy_private.add_objective_update(uuid,numeric,date,text,integer),qhse_policy_private.save_settings(bigint,text,integer) to authenticated;

create function public.qhse_policy_snapshot()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); settings jsonb; processes jsonb; objectives jsonb; updates jsonb;
begin
  if not qhse_policy_private.can_access(company) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  select jsonb_build_object('publication_id',s.publication_id,'document_url',s.document_url,'revision',s.revision,'updated_at',s.updated_at) into settings
  from public.qhse_policy_settings s where s.company_id=company;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'position',p.position,'archived',p.archived,'revision',p.revision,'updated_at',p.updated_at) order by p.position,p.name,p.id),'[]'::jsonb)
  into processes from public.qhse_policy_processes p where p.company_id=company;
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'process_id',o.process_id,'title',o.title,'description',o.description,'owner_label',o.owner_label,'due_on',o.due_on,'progress',o.progress,'archived',o.archived,'revision',o.revision,'created_at',o.created_at,'updated_at',o.updated_at) order by o.created_at,o.id),'[]'::jsonb)
  into objectives from public.qhse_policy_objectives o where o.company_id=company;
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'objective_id',u.objective_id,'kind',u.kind,'progress',u.progress,'occurred_on',u.occurred_on,'note',u.note,'actor_name',u.actor_name,'created_at',u.created_at) order by u.created_at desc,u.id desc),'[]'::jsonb)
  into updates from public.qhse_policy_objective_updates u where u.company_id=company;
  return jsonb_build_object('settings',settings,'processes',processes,'objectives',objectives,'updates',updates,'can_edit',qhse_policy_private.can_access(company,true));
end $$;
create function public.qhse_policy_save_process(p_id uuid,p_name text,p_description text,p_position integer,p_expected_revision integer)
returns uuid language sql security invoker set search_path='' as $$select qhse_policy_private.save_process(p_id,p_name,p_description,p_position,p_expected_revision);$$;
create function public.qhse_policy_archive_process(p_id uuid,p_archived boolean,p_expected_revision integer)
returns void language sql security invoker set search_path='' as $$select qhse_policy_private.archive_process(p_id,p_archived,p_expected_revision);$$;
create function public.qhse_policy_save_objective(p_id uuid,p_process_id uuid,p_title text,p_description text,p_owner_label text,p_due_on date,p_initial_progress numeric,p_expected_revision integer)
returns uuid language sql security invoker set search_path='' as $$select qhse_policy_private.save_objective(p_id,p_process_id,p_title,p_description,p_owner_label,p_due_on,p_initial_progress,p_expected_revision);$$;
create function public.qhse_policy_archive_objective(p_id uuid,p_archived boolean,p_expected_revision integer)
returns void language sql security invoker set search_path='' as $$select qhse_policy_private.archive_objective(p_id,p_archived,p_expected_revision);$$;
create function public.qhse_policy_add_objective_update(p_objective_id uuid,p_progress numeric,p_occurred_on date,p_note text,p_expected_revision integer)
returns uuid language sql security invoker set search_path='' as $$select qhse_policy_private.add_objective_update(p_objective_id,p_progress,p_occurred_on,p_note,p_expected_revision);$$;
create function public.qhse_policy_save_settings(p_publication_id bigint,p_document_url text,p_expected_revision integer)
returns void language sql security invoker set search_path='' as $$select qhse_policy_private.save_settings(p_publication_id,p_document_url,p_expected_revision);$$;
revoke all on function public.qhse_policy_snapshot(),public.qhse_policy_save_process(uuid,text,text,integer,integer),public.qhse_policy_archive_process(uuid,boolean,integer),
  public.qhse_policy_save_objective(uuid,uuid,text,text,text,date,numeric,integer),public.qhse_policy_archive_objective(uuid,boolean,integer),
  public.qhse_policy_add_objective_update(uuid,numeric,date,text,integer),public.qhse_policy_save_settings(bigint,text,integer) from public,anon;
grant execute on function public.qhse_policy_snapshot(),public.qhse_policy_save_process(uuid,text,text,integer,integer),public.qhse_policy_archive_process(uuid,boolean,integer),
  public.qhse_policy_save_objective(uuid,uuid,text,text,text,date,numeric,integer),public.qhse_policy_archive_objective(uuid,boolean,integer),
  public.qhse_policy_add_objective_update(uuid,numeric,date,text,integer),public.qhse_policy_save_settings(bigint,text,integer) to authenticated;
notify pgrst,'reload schema';
