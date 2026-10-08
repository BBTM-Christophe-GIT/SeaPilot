-- Strategic axes keep existing internal process IDs, names and order.
alter table public.qhse_policy_processes add column icon_key text not null default 'general'
  constraint qhse_policy_processes_icon_key_check
  check(icon_key in ('safety','ethics','health','environment','customer','cybersecurity','general'));

-- Infer an initial icon once; afterwards the explicit persisted key wins.
with names as (
  select id,translate(lower(name),'àâäáãåéèêëíìîïóòôöõúùûüçñ','aaaaaaeeeeiiiiooooouuuucn') as normalized
  from public.qhse_policy_processes
)
update public.qhse_policy_processes p set icon_key=case
  when n.normalized ~ '(cyber|informat|numerique|digital|donnee)' then 'cybersecurity'
  when n.normalized ~ '(sante|bien.?etre|discrimin|maladie|hygiene|health|well.?being)' then 'health'
  when n.normalized ~ '(ethiq|ethic|corrupt|integrite)' then 'ethics'
  when n.normalized ~ '(environ|ecolog|durab|climat|pollut|energie)' then 'environment'
  when n.normalized ~ '(client|ecoute|customer|satisfaction)' then 'customer'
  when n.normalized ~ '(secur|safety|accident|risque|prevention)' then 'safety'
  else 'general' end
from names n where n.id=p.id;
comment on column public.qhse_policy_processes.icon_key is
  'Explicit strategic-axis icon. Existing names are inferred once on migration; subsequent general is a deliberate choice. No direct client writes.';

-- One six-argument function with a default prevents ambiguous PostgREST
-- overload resolution while keeping old five-argument callers working.
drop function public.qhse_policy_save_process(uuid,text,text,integer,integer);
drop function qhse_policy_private.save_process(uuid,text,text,integer,integer);
create function qhse_policy_private.save_process(
  p_id uuid,p_name text,p_description text,p_position integer,p_expected_revision integer,p_icon_key text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); target public.qhse_policy_processes; target_id uuid;
begin
  if not qhse_policy_private.can_access(company,true) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(company::text||':qhse-policy-processes',0));
  if p_name is null or length(btrim(p_name)) not between 1 and 200 or length(coalesce(p_description,''))>5000
    or p_position is null or p_position not between 0 and 100000
    or (p_icon_key is not null and p_icon_key not in ('safety','ethics','health','environment','customer','cybersecurity','general'))
    then raise exception 'QHSE_POLICY_INVALID' using errcode='22023'; end if;
  if p_id is null then
    if p_expected_revision is not null then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
    insert into public.qhse_policy_processes(company_id,name,description,position,icon_key,created_by,updated_by)
    values(company,btrim(p_name),btrim(coalesce(p_description,'')),p_position,coalesce(p_icon_key,'general'),auth.uid(),auth.uid()) returning id into target_id;
  else
    select * into target from public.qhse_policy_processes where id=p_id and company_id=company for update;
    if target.id is null then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
    if target.revision is distinct from p_expected_revision then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
    if target.archived then raise exception 'QHSE_POLICY_ARCHIVED' using errcode='22023'; end if;
    update public.qhse_policy_processes set name=btrim(p_name),description=btrim(coalesce(p_description,'')),position=p_position,
      icon_key=coalesce(p_icon_key,target.icon_key),revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid()
    where id=p_id returning id into target_id;
  end if;
  return target_id;
end $$;
create function public.qhse_policy_save_process(
  p_id uuid,p_name text,p_description text,p_position integer,p_expected_revision integer,p_icon_key text default null
)
returns uuid language sql security invoker set search_path='' as $$
  select qhse_policy_private.save_process(p_id,p_name,p_description,p_position,p_expected_revision,p_icon_key);
$$;

create function qhse_policy_private.reorder_processes(p_processes jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); axis jsonb; expected_count integer; changed_at timestamptz;
begin
  if not qhse_policy_private.can_access(company,true) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(company::text||':qhse-policy-processes',0));
  if p_processes is null or jsonb_typeof(p_processes)<>'array' then raise exception 'QHSE_POLICY_INVALID_ORDER' using errcode='22023'; end if;
  if jsonb_array_length(p_processes)>100001 then raise exception 'QHSE_POLICY_INVALID_ORDER' using errcode='22023'; end if;
  for axis in select value from jsonb_array_elements(p_processes) loop
    if jsonb_typeof(axis)<>'object' or jsonb_typeof(axis->'id') is distinct from 'string'
      or coalesce(axis->>'id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or jsonb_typeof(axis->'revision') is distinct from 'number' or coalesce(axis->>'revision','') !~ '^[1-9][0-9]{0,9}$'
      then raise exception 'QHSE_POLICY_INVALID_ORDER' using errcode='22023'; end if;
    if (axis->>'revision')::numeric>2147483647 then raise exception 'QHSE_POLICY_INVALID_ORDER' using errcode='22023'; end if;
  end loop;
  if (select count(distinct (value->>'id')::uuid) from jsonb_array_elements(p_processes))<>jsonb_array_length(p_processes)
    then raise exception 'QHSE_POLICY_INVALID_ORDER' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_processes) requested
    where not exists(select 1 from public.qhse_policy_processes p where p.id=(requested.value->>'id')::uuid and p.company_id=company))
    then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  -- Include archives: a hidden row cannot silently disappear from the order.
  select count(*) into expected_count from public.qhse_policy_processes where company_id=company;
  if expected_count<>jsonb_array_length(p_processes) then raise exception 'QHSE_POLICY_INVALID_ORDER' using errcode='22023'; end if;
  perform p.id from public.qhse_policy_processes p where p.company_id=company order by p.id for update;
  if exists(select 1 from public.qhse_policy_processes p join jsonb_array_elements(p_processes) requested
    on p.id=(requested.value->>'id')::uuid where p.company_id=company and p.revision<>(requested.value->>'revision')::integer)
    then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
  changed_at:=clock_timestamp();
  update public.qhse_policy_processes p set position=(requested.ordinality-1)::integer,
    revision=p.revision+1,updated_at=changed_at,updated_by=auth.uid()
  from jsonb_array_elements(p_processes) with ordinality requested(value,ordinality)
  where p.company_id=company and p.id=(requested.value->>'id')::uuid;
end $$;
create function public.qhse_policy_reorder_processes(p_processes jsonb)
returns void language sql security invoker set search_path='' as $$select qhse_policy_private.reorder_processes(p_processes);$$;

create function qhse_policy_private.delete_process(
  p_id uuid,p_expected_revision integer,p_transfer_to uuid default null,p_transfer_expected_revision integer default null
)
returns void language plpgsql security definer set search_path='' as $$
declare company bigint:=public.current_planning_company_id(); source public.qhse_policy_processes;
  destination public.qhse_policy_processes; has_objectives boolean; changed_at timestamptz;
begin
  if not qhse_policy_private.can_access(company,true) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(company::text||':qhse-policy-processes',0));
  perform p.id from public.qhse_policy_processes p where p.company_id=company and p.id in (p_id,p_transfer_to) order by p.id for update;
  select * into source from public.qhse_policy_processes where id=p_id and company_id=company;
  if source.id is null then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
  if source.revision is distinct from p_expected_revision then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
  select exists(select 1 from public.qhse_policy_objectives where company_id=company and process_id=p_id) into has_objectives;
  if (has_objectives and p_transfer_to is null) or (p_transfer_to is null and p_transfer_expected_revision is not null)
    or p_transfer_to=p_id then raise exception 'QHSE_POLICY_TRANSFER_REQUIRED' using errcode='22023'; end if;
  if p_transfer_to is not null then
    select * into destination from public.qhse_policy_processes where id=p_transfer_to and company_id=company;
    if destination.id is null then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;
    if destination.revision is distinct from p_transfer_expected_revision then raise exception 'QHSE_POLICY_REVISION_CHANGED' using errcode='40001'; end if;
    if destination.archived then raise exception 'QHSE_POLICY_ARCHIVED' using errcode='22023'; end if;
  end if;
  if has_objectives then
    changed_at:=clock_timestamp();
    -- UUIDs, progress, employment owners, history and storage paths stay intact.
    update public.qhse_policy_objectives set process_id=p_transfer_to,revision=revision+1,updated_at=changed_at,updated_by=auth.uid()
    where company_id=company and process_id=p_id;
    update public.qhse_policy_processes set revision=revision+1,updated_at=changed_at,updated_by=auth.uid()
    where company_id=company and id=p_transfer_to;
  end if;
  delete from public.qhse_policy_processes where id=p_id and company_id=company;
end $$;
create function public.qhse_policy_delete_process(
  p_id uuid,p_expected_revision integer,p_transfer_to uuid default null,p_transfer_expected_revision integer default null
)
returns void language sql security invoker set search_path='' as $$
  select qhse_policy_private.delete_process(p_id,p_expected_revision,p_transfer_to,p_transfer_expected_revision);
$$;

-- Existing writers participate in the same company lock. This closes races
-- with creation, archive, objective moves, progress, and attachment finalization.
do $writers$
declare signature regprocedure; previous text; updated text;
  permission_guard text:=$guard$if not qhse_policy_private.can_access(company,true) then raise exception 'QHSE_POLICY_PERMISSION_DENIED' using errcode='42501'; end if;$guard$;
begin
  foreach signature in array array[
    'qhse_policy_private.archive_process(uuid,boolean,integer)'::regprocedure,
    'qhse_policy_private.save_objective(uuid,uuid,text,text,text,date,numeric,integer,text,bigint,bigint)'::regprocedure,
    'qhse_policy_private.archive_objective(uuid,boolean,integer)'::regprocedure,
    'qhse_policy_private.add_objective_update(uuid,numeric,date,text,integer)'::regprocedure,
    'qhse_policy_private.add_update_with_attachments(uuid,numeric,date,text,integer,uuid[])'::regprocedure
  ] loop
    previous:=pg_get_functiondef(signature);
    updated:=replace(previous,permission_guard,permission_guard||E'\n  perform pg_advisory_xact_lock(hashtextextended(company::text||'':qhse-policy-processes'',0));');
    if updated=previous then raise exception 'Expected QHSE permission guard missing in %',signature; end if;
    execute updated;
  end loop;
end $writers$;

do $snapshot$
declare previous text; updated text;
begin
  previous:=pg_get_functiondef('public.qhse_policy_snapshot()'::regprocedure);
  updated:=replace(previous,$old$'description',p.description,'position',p.position$old$,$new$'description',p.description,'icon_key',p.icon_key,'position',p.position$new$);
  if updated=previous then raise exception 'Expected QHSE process projection missing'; end if;
  execute updated;
end $snapshot$;

revoke all on function qhse_policy_private.save_process(uuid,text,text,integer,integer,text),
  qhse_policy_private.reorder_processes(jsonb),qhse_policy_private.delete_process(uuid,integer,uuid,integer),
  public.qhse_policy_save_process(uuid,text,text,integer,integer,text),
  public.qhse_policy_reorder_processes(jsonb),public.qhse_policy_delete_process(uuid,integer,uuid,integer) from public,anon;
grant execute on function qhse_policy_private.save_process(uuid,text,text,integer,integer,text),
  qhse_policy_private.reorder_processes(jsonb),qhse_policy_private.delete_process(uuid,integer,uuid,integer),
  public.qhse_policy_save_process(uuid,text,text,integer,integer,text),
  public.qhse_policy_reorder_processes(jsonb),public.qhse_policy_delete_process(uuid,integer,uuid,integer) to authenticated;
comment on function public.qhse_policy_reorder_processes(jsonb) is
  'Admin/Direction atomic full strategic-axis order (including archives), exact active-company IDs and optimistic revisions; stable company lock shared with all writers.';
comment on function public.qhse_policy_delete_process(uuid,integer,uuid,integer) is
  'Admin/Direction axis deletion. Every active/archived objective must be transferred to an active same-company axis with matching source/target revisions; progress/history/attachments retained.';
notify pgrst,'reload schema';
