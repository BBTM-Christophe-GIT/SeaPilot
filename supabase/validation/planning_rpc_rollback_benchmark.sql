-- Benchmark one real assignment-day edit under an existing authorized office
-- account. The RPC, triggers and audit run normally inside a subtransaction,
-- then roll back before the outer transaction commits session metrics only.
-- Do not print assignment IDs, names, notes, tokens or returned payloads.
begin;
do $$
declare actor uuid;
begin
  select ur.user_id into actor from public.user_roles ur
  join public.profiles profile on profile.id=ur.user_id and profile.active_company_id=ur.company_id
  join public.company_memberships membership on membership.company_id=ur.company_id
    and membership.user_id=ur.user_id and membership.active
  join public.companies company on company.id=ur.company_id and company.code='bbtm'
  where ur.role_key='admin' order by ur.user_id limit 1;
  if actor is null then raise exception 'No active office benchmark identity'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end $$;
set local role authenticated;
do $$
declare
  target public.planning_assignments%rowtype; benchmark_date date; original_days jsonb;
  original_assignment jsonb; original_history_count bigint; original_note text;
  current_status text; started timestamptz; elapsed_ms numeric;
  edited boolean := false;
begin
  select * into target from public.planning_assignments
  where company_id=public.current_planning_company_id() and confirmation_status<>'cancelled'
    and status_label in ('En Mer','A Terre','Extra','Repos','Vacance','Congés Paternité','Arrêt Maladie','Accident du Travail','Formation')
  order by ends_on desc,id desc limit 1;
  if target.id is null then raise exception 'No editable assignment for rollback benchmark'; end if;
  benchmark_date:=greatest(target.starts_on,least(current_date,target.ends_on));
  original_assignment:=to_jsonb(target);
  select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]'::jsonb) into original_days
    from public.planning_days d where company_id=target.company_id and slot365='assignment:'||target.id
      and source_label='seapilot-assignment-note';
  select count(*) into original_history_count from public.planning_change_log where company_id=target.company_id;
  select comments,sailor_status into original_note,current_status from public.planning_days
    where company_id=target.company_id and slot365='assignment:'||target.id
      and source_label='seapilot-assignment-note' and work_date=benchmark_date;
  current_status:=coalesce(nullif(current_status,''),target.status_label);
  begin
    started:=clock_timestamp();
    perform public.save_planning_assignment_day_details(target.id,benchmark_date,
      case when current_status='Repos' then 'En Mer' else 'Repos' end,coalesce(original_note,''),null);
    elapsed_ms:=extract(epoch from clock_timestamp()-started)*1000;
    edited:=true;
    raise exception using errcode='PZ001',message='rollback benchmark edit';
  exception when sqlstate 'PZ001' then null;
  end;
  if not edited then raise exception 'Benchmark edit did not run'; end if;
  if (select to_jsonb(a) from public.planning_assignments a where id=target.id) is distinct from original_assignment
    or (select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]'::jsonb) from public.planning_days d
      where company_id=target.company_id and slot365='assignment:'||target.id and source_label='seapilot-assignment-note') is distinct from original_days
    or (select count(*) from public.planning_change_log where company_id=target.company_id)<>original_history_count then
    raise exception 'Rollback benchmark changed persistent planning state';
  end if;
  perform set_config('test.planning_perf.save_result',jsonb_build_object('rpc','save_planning_assignment_day_details',
    'elapsed_ms',round(elapsed_ms,3),'assignment_and_days_unchanged',true,'audit_unchanged',true)::text,false);
end $$;
commit;
with captured as materialized (select current_setting('test.planning_perf.save_result')::jsonb as measurement)
select measurement,set_config('test.planning_perf.save_result','',false) as reset from captured;

