-- Reuse assignment coverage for NEW workflow decisions. A bad individual
-- rolling window is diagnostic evidence, not an assignment-wide verdict.
-- No existing signature, approval, audit event or calculation is rewritten.
alter table public.working_time_day_approvals
  add column compliance_analysis_snapshot jsonb not null default '{}'::jsonb;
alter table public.working_time_day_approval_events
  add column compliance_analysis_snapshot jsonb not null default '{}'::jsonb;
alter table public.working_time_validations
  add column compliance_analysis_snapshot jsonb not null default '{}'::jsonb;

create function private.working_time_register_assignment_analysis(p_register_id bigint)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare target_register public.working_time_registers%rowtype; target_timezone text;
begin
  select * into target_register from public.working_time_registers where id=p_register_id;
  if target_register.id is null or not exists (
    select 1 from public.planning_assignments a
    where a.company_id=target_register.company_id and a.crew_person_id=target_register.person_id
      and a.confirmation_status<>'cancelled' and a.starts_on<=target_register.period_end
      and a.ends_on>=target_register.period_start
  ) then return jsonb_build_object('assignment_coverage','[]'::jsonb); end if;
  select i.timezone_name into target_timezone from public.working_time_intervals i
  where i.person_id=target_register.person_id and i.voided_at is null
  order by (i.register_id=p_register_id) desc,i.starts_at desc limit 1;
  target_timezone:=coalesce(target_timezone,'Europe/Paris');
  return private.working_time_assignment_analysis(target_register.person_id,
    target_register.period_start::timestamp at time zone target_timezone,
    (target_register.period_end+1)::timestamp at time zone target_timezone,
    target_timezone,'[]'::jsonb,null,null,null)
    || jsonb_build_object('workflow_timezone',target_timezone,'workflow_algorithm','assignment_coverage_v1');
end;
$$;
revoke all on function private.working_time_register_assignment_analysis(bigint) from public,anon,authenticated;

create function private.working_time_day_coverage_from_analysis(p_analysis jsonb,p_local_work_date date)
returns jsonb language sql stable set search_path=''
as $$
  with bounds as (
    select p_local_work_date::timestamp at time zone coalesce(p_analysis->>'workflow_timezone','Europe/Paris') starts_at,
      (p_local_work_date+1)::timestamp at time zone coalesce(p_analysis->>'workflow_timezone','Europe/Paris') ends_at
  ), scopes as materialized (
    select s from jsonb_array_elements(coalesce(p_analysis->'assignment_coverage','[]'::jsonb)) s,bounds
    where s->>'assignment_id' is not null
      and (s->>'scope_starts_at')::timestamptz<bounds.ends_at
      and (s->>'scope_ends_at')::timestamptz>bounds.starts_at
  )
  select jsonb_build_object('applicable',exists(select 1 from scopes),
    'non_compliant',exists(select 1 from scopes,bounds,
      jsonb_array_elements(coalesce(s->'uncovered_ranges','[]'::jsonb)) gap
      where s->>'status'='uncovered' and (gap->>'starts_at')::timestamptz<bounds.ends_at
        and (gap->>'ends_at')::timestamptz>bounds.starts_at),
    'assignment_coverage',coalesce((select jsonb_agg(s) from scopes),'[]'::jsonb));
$$;
revoke all on function private.working_time_day_coverage_from_analysis(jsonb,date) from public,anon,authenticated;

-- The original attribution remains the fallback for manual hours outside an
-- actual assignment. Copying its definition preserves its precise old rules.
do $migration$
declare definition text;
begin
  definition:=replace(pg_get_functiondef('public.working_time_day_violations(bigint,date)'::regprocedure),chr(13),'');
  definition:=replace(definition,'FUNCTION public.working_time_day_violations(',
    'FUNCTION private.working_time_legacy_day_violations(');
  execute definition;
end;
$migration$;
revoke all on function private.working_time_legacy_day_violations(bigint,date) from public,anon,authenticated;

-- A daily approver sees only coverage scopes touching that signed day,
-- never unrelated assignments elsewhere in the monthly register.
create function private.working_time_day_coverage_snapshot(p_analysis jsonb,p_local_work_date date)
returns jsonb language sql stable set search_path=''
as $$ select jsonb_build_object('workflow_algorithm','assignment_coverage_v1',
  'timezone_name',coalesce(p_analysis->>'workflow_timezone','Europe/Paris'),
  'local_work_date',p_local_work_date,
  'assignment_coverage',private.working_time_day_coverage_from_analysis(p_analysis,p_local_work_date)->'assignment_coverage'); $$;
revoke all on function private.working_time_day_coverage_snapshot(jsonb,date) from public,anon,authenticated;

create function private.working_time_day_non_compliant_with_analysis(
  p_register_id bigint,p_local_work_date date,p_analysis jsonb
) returns boolean language plpgsql stable security definer set search_path=''
as $$
declare verdict jsonb;
begin
  if not exists(select 1 from public.working_time_registers r where r.id=p_register_id
    and p_local_work_date between r.period_start and r.period_end) then return false; end if;
  verdict:=private.working_time_day_coverage_from_analysis(p_analysis,p_local_work_date);
  if (verdict->>'applicable')::boolean then return (verdict->>'non_compliant')::boolean; end if;
  return exists(select 1 from private.working_time_legacy_day_violations(p_register_id,p_local_work_date));
end;
$$;
revoke all on function private.working_time_day_non_compliant_with_analysis(bigint,date,jsonb) from public,anon,authenticated;

create or replace function public.working_time_day_has_non_compliance(p_register_id bigint,p_local_work_date date)
returns boolean language sql stable security definer set search_path=''
as $$ select private.working_time_day_non_compliant_with_analysis(p_register_id,p_local_work_date,
  private.working_time_register_assignment_analysis(p_register_id)); $$;
revoke all on function public.working_time_day_has_non_compliance(bigint,date) from public,anon,authenticated;

create function private.working_time_register_non_compliant_days(p_register_id bigint,p_analysis jsonb)
returns table(local_work_date date) language sql stable security definer set search_path=''
as $$
  with register as (select * from public.working_time_registers where id=p_register_id),
  candidates as (
    select i.local_work_date from public.working_time_intervals i,register r
    where i.register_id=r.id and i.voided_at is null
    union
    select c.local_window_end_date from public.working_time_calculation_windows c,register r
    where c.company_id=r.company_id and c.person_id=r.person_id and c.is_compliant is false
      and c.local_window_end_date between r.period_start and r.period_end
  )
  select d.local_work_date from candidates d cross join lateral
    private.working_time_day_coverage_from_analysis(p_analysis,d.local_work_date) verdict
  where case when (verdict->>'applicable')::boolean then
      (verdict->>'non_compliant')::boolean and exists(select 1 from public.working_time_intervals i
        where i.register_id=p_register_id and i.local_work_date=d.local_work_date and i.voided_at is null)
    else exists(select 1 from public.working_time_calculation_windows c,register r
      where c.person_id=r.person_id and c.company_id=r.company_id and c.is_compliant is false
        and c.local_window_end_date=d.local_work_date) end;
$$;
revoke all on function private.working_time_register_non_compliant_days(bigint,jsonb) from public,anon,authenticated;

create function private.working_time_day_coverage_gap_evidence(p_analysis jsonb,p_local_work_date date)
returns jsonb language sql stable set search_path=''
as $$
  select case when (v->>'applicable')::boolean and (v->>'non_compliant')::boolean
    then jsonb_build_array(jsonb_build_object('local_work_date',p_local_work_date,
      'analysis_kind','assignment_coverage_gap','assignment_coverage',v->'assignment_coverage'))
    else '[]'::jsonb end
  from private.working_time_day_coverage_from_analysis(p_analysis,p_local_work_date) v;
$$;
revoke all on function private.working_time_day_coverage_gap_evidence(jsonb,date) from public,anon,authenticated;

create function private.working_time_register_coverage_gap_evidence(p_register_id bigint,p_analysis jsonb)
returns jsonb language sql stable security definer set search_path=''
as $$
  select coalesce(jsonb_agg(item order by item->>'local_work_date'),'[]'::jsonb)
  from private.working_time_register_non_compliant_days(p_register_id,p_analysis) d,
    jsonb_array_elements(private.working_time_day_coverage_gap_evidence(p_analysis,d.local_work_date)) item;
$$;
revoke all on function private.working_time_register_coverage_gap_evidence(bigint,jsonb) from public,anon,authenticated;

do $migration$
declare definition text; previous text; replacement text;
begin
  definition:=replace(pg_get_functiondef('public.working_time_day_violations(bigint,date)'::regprocedure),chr(13),'');
  previous := $old$    and contributing_day.local_work_date = p_local_work_date$old$;
  replacement := $new$    and contributing_day.local_work_date = p_local_work_date
    and not (private.working_time_day_coverage_from_analysis(
      private.working_time_register_assignment_analysis(p_register_id),p_local_work_date)->>'applicable')::boolean$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.working_time_day_violations(bigint,date)';
  end if;
  definition:=replace(definition,previous,replacement);
  execute definition;
end;
$migration$;

do $migration$
declare definition text; previous text; replacement text;
begin
  definition:=replace(pg_get_functiondef('public.submit_working_time_day(bigint,date)'::regprocedure),chr(13),'');
  previous := $old$  self_captain boolean := false;$old$;
  replacement := $new$  self_captain boolean := false;
  assignment_analysis jsonb;$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.submit_working_time_day(bigint,date)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$  self_captain :=$old$;
  replacement := $new$  assignment_analysis:=private.working_time_register_assignment_analysis(target_register.id);
  self_captain :=$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.submit_working_time_day(bigint,date)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$not public.working_time_day_has_non_compliance(target_register.id, p_local_work_date)$old$;
  replacement := $new$not private.working_time_day_non_compliant_with_analysis(target_register.id,p_local_work_date,assignment_analysis)$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.submit_working_time_day(bigint,date)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$    interval_snapshot, non_compliance_snapshot, updated_at$old$;
  replacement := $new$    interval_snapshot, non_compliance_snapshot, compliance_analysis_snapshot, updated_at$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.submit_working_time_day(bigint,date)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$    intervals_data,
    '[]'::jsonb,
    now()$old$;
  replacement := $new$    intervals_data,
    '[]'::jsonb,
    private.working_time_day_coverage_snapshot(assignment_analysis,p_local_work_date),
    now()$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.submit_working_time_day(bigint,date)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$      non_compliance_snapshot = excluded.non_compliance_snapshot,$old$;
  replacement := $new$      non_compliance_snapshot = excluded.non_compliance_snapshot,
      compliance_analysis_snapshot = excluded.compliance_analysis_snapshot,$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.submit_working_time_day(bigint,date)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$    actor_identity_snapshot, interval_snapshot, non_compliance_snapshot
$old$;
  replacement := $new$    actor_identity_snapshot, interval_snapshot, non_compliance_snapshot, compliance_analysis_snapshot
$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.submit_working_time_day(bigint,date)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$    intervals_data,
    '[]'::jsonb
  );$old$;
  replacement := $new$    intervals_data,
    '[]'::jsonb,
    private.working_time_day_coverage_snapshot(assignment_analysis,p_local_work_date)
  );$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.submit_working_time_day(bigint,date)';
  end if;
  definition:=replace(definition,previous,replacement);
  execute definition;
end;
$migration$;

do $migration$
declare definition text; previous text; replacement text;
begin
  definition:=replace(pg_get_functiondef('public.validate_working_time_day(bigint)'::regprocedure),chr(13),'');
  previous := $old$  is_hr_captain boolean;$old$;
  replacement := $new$  is_hr_captain boolean;
  assignment_analysis jsonb;$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.validate_working_time_day(bigint)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$  if public.working_time_day_has_non_compliance(target_register.id, target_approval.local_work_date)$old$;
  replacement := $new$  assignment_analysis:=private.working_time_register_assignment_analysis(target_register.id);
  if private.working_time_day_non_compliant_with_analysis(target_register.id,target_approval.local_work_date,assignment_analysis)$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.validate_working_time_day(bigint)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$  from public.working_time_day_violations(target_register.id, target_approval.local_work_date) attributed$old$;
  replacement := $new$  from private.working_time_legacy_day_violations(target_register.id, target_approval.local_work_date) attributed$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.validate_working_time_day(bigint)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$  join public.working_time_calculation_windows calculation on calculation.id = attributed.calculation_id;$old$;
  replacement := $new$  join public.working_time_calculation_windows calculation on calculation.id = attributed.calculation_id
  where not (private.working_time_day_coverage_from_analysis(assignment_analysis,target_approval.local_work_date)->>'applicable')::boolean;
  non_compliance_data:=non_compliance_data||private.working_time_day_coverage_gap_evidence(assignment_analysis,target_approval.local_work_date);$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.validate_working_time_day(bigint)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$    interval_snapshot = intervals_data, non_compliance_snapshot = non_compliance_data, updated_at = now()$old$;
  replacement := $new$    interval_snapshot = intervals_data, non_compliance_snapshot = non_compliance_data,
    compliance_analysis_snapshot = private.working_time_day_coverage_snapshot(assignment_analysis,target_approval.local_work_date), updated_at = now()$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.validate_working_time_day(bigint)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$    actor_identity_snapshot, interval_snapshot, non_compliance_snapshot
$old$;
  replacement := $new$    actor_identity_snapshot, interval_snapshot, non_compliance_snapshot, compliance_analysis_snapshot
$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.validate_working_time_day(bigint)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$    intervals_data, non_compliance_data
  )$old$;
  replacement := $new$    intervals_data, non_compliance_data, private.working_time_day_coverage_snapshot(assignment_analysis,target_approval.local_work_date)
  )$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.validate_working_time_day(bigint)';
  end if;
  definition:=replace(definition,previous,replacement);
  execute definition;
end;
$migration$;

do $migration$
declare definition text; previous text; replacement text;
begin
  definition:=replace(pg_get_functiondef('public.validate_working_time_register(bigint)'::regprocedure),chr(13),'');
  previous := $old$  non_compliance_data jsonb;$old$;
  replacement := $new$  non_compliance_data jsonb;
  assignment_analysis jsonb;$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.validate_working_time_register(bigint)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$  if exists (
$old$;
  replacement := $new$  assignment_analysis:=private.working_time_register_assignment_analysis(target_register.id);
  if exists (
$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.validate_working_time_register(bigint)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$      select distinct calculation.local_window_end_date
      from public.working_time_calculation_windows calculation
      where calculation.company_id = target_register.company_id
        and calculation.person_id = target_register.person_id
        and calculation.local_window_end_date between target_register.period_start and target_register.period_end
        and calculation.is_compliant is false
$old$;
  replacement := $new$      select local_work_date as local_window_end_date
      from private.working_time_register_non_compliant_days(target_register.id,assignment_analysis)
$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.validate_working_time_register(bigint)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$and calculation.is_compliant is false;$old$;
  replacement := $new$and calculation.is_compliant is false
    and not (private.working_time_day_coverage_from_analysis(assignment_analysis,calculation.local_window_end_date)->>'applicable')::boolean;
  non_compliance_data:=non_compliance_data||private.working_time_register_coverage_gap_evidence(target_register.id,assignment_analysis);$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.validate_working_time_register(bigint)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$    interval_snapshot, non_compliance_snapshot,$old$;
  replacement := $new$    interval_snapshot, non_compliance_snapshot, compliance_analysis_snapshot,$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.validate_working_time_register(bigint)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$    intervals_data, non_compliance_data,$old$;
  replacement := $new$    intervals_data, non_compliance_data, assignment_analysis,$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.validate_working_time_register(bigint)';
  end if;
  definition:=replace(definition,previous,replacement);
  execute definition;
end;
$migration$;

do $migration$
declare definition text; previous text; replacement text;
begin
  definition:=replace(pg_get_functiondef('public.transition_working_time_register(bigint,text,text)'::regprocedure),chr(13),'');
  previous := $old$  non_compliance_data jsonb;$old$;
  replacement := $new$  non_compliance_data jsonb;
  assignment_analysis jsonb;$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.transition_working_time_register(bigint,text,text)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$    if exists (
$old$;
  replacement := $new$    assignment_analysis:=private.working_time_register_assignment_analysis(target_register.id);
    if exists (
$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.transition_working_time_register(bigint,text,text)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$      select distinct calculation.local_window_end_date
        from public.working_time_calculation_windows calculation
        where calculation.company_id = target_register.company_id
          and calculation.person_id = target_register.person_id
          and calculation.local_window_end_date between target_register.period_start and target_register.period_end
          and calculation.is_compliant is false
  $old$;
  replacement := $new$      select local_work_date as local_window_end_date
      from private.working_time_register_non_compliant_days(target_register.id,assignment_analysis)
  $new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.transition_working_time_register(bigint,text,text)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$  select coalesce(jsonb_agg(jsonb_build_object(
    'local_work_date', $old$;
  replacement := $new$  if assignment_analysis is null then
    assignment_analysis:=private.working_time_register_assignment_analysis(target_register.id);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'local_work_date', $new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.transition_working_time_register(bigint,text,text)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$and calculation.is_compliant is false
    group by calculation.local_window_end_date$old$;
  replacement := $new$and calculation.is_compliant is false
    and not (private.working_time_day_coverage_from_analysis(assignment_analysis,calculation.local_window_end_date)->>'applicable')::boolean
    group by calculation.local_window_end_date$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.transition_working_time_register(bigint,text,text)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$   and day_comment.local_work_date = non_compliant_day.local_work_date;$old$;
  replacement := $new$   and day_comment.local_work_date = non_compliant_day.local_work_date;
  non_compliance_data:=non_compliance_data||private.working_time_register_coverage_gap_evidence(target_register.id,assignment_analysis);$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.transition_working_time_register(bigint,text,text)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$    interval_snapshot, non_compliance_snapshot,$old$;
  replacement := $new$    interval_snapshot, non_compliance_snapshot, compliance_analysis_snapshot,$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.transition_working_time_register(bigint,text,text)';
  end if;
  definition:=replace(definition,previous,replacement);
  previous := $old$    intervals_data, non_compliance_data,$old$;
  replacement := $new$    intervals_data, non_compliance_data, assignment_analysis,$new$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected workflow definition: public.transition_working_time_register(bigint,text,text)';
  end if;
  definition:=replace(definition,previous,replacement);
  execute definition;
end;
$migration$;

-- The invoker selects one genuinely readable source per person/timezone,
-- including neighboring dates, so gaps without a legacy bad calculation still
-- have an authoritative source. The worker repeats that authorization check.
create function private.working_time_coverage_alert_rows(
  p_calculation_ids bigint[],p_starts_on date,p_ends_on date
) returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare actor_company bigint:=public.current_planning_company_id(); scope record;
  analysis jsonb; result jsonb:='[]'::jsonb; item jsonb; gap jsonb; legacy_rows jsonb; allowed_ids bigint[];
  source public.working_time_calculation_windows%rowtype;
  assignment public.planning_assignments%rowtype;
begin
  if auth.uid() is null or actor_company is null or not public.user_belongs_to_company(actor_company) then return result; end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on<p_starts_on or p_ends_on-p_starts_on>366
    or coalesce(cardinality(p_calculation_ids),0)>500 then
    raise exception using errcode='22023',message='WORKING_TIME_COVERAGE_ALERT_LIMIT.';
  end if;
  allowed_ids:=array(select public.working_time_readable_calculation_ids());
  for scope in
    select c.person_id,c.timezone_name,array_agg(c.id) ids
    from public.working_time_calculation_windows c
    where c.company_id=actor_company and c.id=any(p_calculation_ids) and c.id=any(allowed_ids)
    group by c.person_id,c.timezone_name
  loop
    select * into source from public.working_time_calculation_windows where id=any(scope.ids)
    order by calculated_at desc,id desc limit 1;
    if exists(select 1 from public.planning_assignments a
      where a.company_id=actor_company and a.crew_person_id=scope.person_id
        and a.confirmation_status<>'cancelled' and a.starts_on<=p_ends_on and a.ends_on>=p_starts_on) then
      analysis:=private.working_time_assignment_analysis(scope.person_id,
        p_starts_on::timestamp at time zone scope.timezone_name,
        (p_ends_on+1)::timestamp at time zone scope.timezone_name,scope.timezone_name,'[]',null,null,null)
        ||jsonb_build_object('workflow_timezone',scope.timezone_name);
    else analysis:='{}'::jsonb; end if;
    for item in select value from jsonb_array_elements(coalesce(analysis->'assignment_coverage','[]'::jsonb))
      where value->>'assignment_id' is not null and value->>'status'='uncovered'
    loop
      select * into assignment from public.planning_assignments where id=(item->>'assignment_id')::bigint;
      if not (scope.person_id=public.current_person_id()
        or public.has_company_role(actor_company,array['admin','direction','armement'])
        or public.working_time_captain_can_access_period(actor_company,scope.person_id,
          assignment.starts_on,assignment.ends_on,assignment.vessel_id,assignment.watch_group)) then continue; end if;
      select value into gap from jsonb_array_elements(coalesce(item->'uncovered_ranges','[]'::jsonb))
      where (value->>'starts_at')::timestamptz<(p_ends_on+1)::timestamp at time zone scope.timezone_name
        and (value->>'ends_at')::timestamptz>p_starts_on::timestamp at time zone scope.timezone_name
      order by (value->>'starts_at')::timestamptz limit 1;
      if gap is not null then
        result:=result||jsonb_build_array(to_jsonb(source)||jsonb_build_object(
          'violation_codes',jsonb_build_array('assignment_coverage'),
          'coverage_starts_at',gap->'starts_at','coverage_ends_at',gap->'ends_at',
          'assignment_id',item->'assignment_id','assignment_coverage',item,
          'coverage_vessel_id',assignment.vessel_id,'coverage_watch_group',assignment.watch_group,
          'coverage_timezone',scope.timezone_name));
      end if;
    end loop;
    -- Unassigned manual records retain their original alert rows and wording.
    select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into legacy_rows
    from public.working_time_calculation_windows c
    where c.company_id=actor_company and c.person_id=scope.person_id and c.timezone_name=scope.timezone_name
      and c.id=any(allowed_ids) and c.is_compliant is false
      and c.local_window_end_date between p_starts_on and p_ends_on
      and not exists(select 1 from jsonb_array_elements(coalesce(analysis->'assignment_coverage','[]'::jsonb)) a
        where a->>'assignment_id' is not null
          and (a->>'scope_starts_at')::timestamptz<(c.local_window_end_date+1)::timestamp at time zone scope.timezone_name
          and (a->>'scope_ends_at')::timestamptz>c.local_window_end_date::timestamp at time zone scope.timezone_name);
    result:=result||legacy_rows;
  end loop;
  return coalesce((select jsonb_agg(value) from (select value from jsonb_array_elements(result)
    order by coalesce(value->>'coverage_starts_at',value->>'calculated_at') desc limit 500) limited),'[]'::jsonb);
end;
$$;
revoke all on function private.working_time_coverage_alert_rows(bigint[],date,date) from public,anon,authenticated;
grant execute on function private.working_time_coverage_alert_rows(bigint[],date,date) to authenticated;

create function public.working_time_coverage_alerts(
  p_starts_on date,p_ends_on date,p_person_ids bigint[] default null
) returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare candidate_ids bigint[];
begin
  if p_starts_on is null or p_ends_on is null or p_ends_on<p_starts_on or p_ends_on-p_starts_on>366
    or coalesce(cardinality(p_person_ids),0)>500 then
    raise exception using errcode='22023',message='WORKING_TIME_COVERAGE_ALERT_RANGE_INVALID.';
  end if;
  -- Actual RLS applies here. One source per person avoids filling the limit
  -- with many obsolete bad windows belonging to the same register.
  select array_agg(c.id order by c.calculated_at desc,c.id desc) into candidate_ids from (
    select distinct on(person_id,timezone_name) id,calculated_at
    from public.working_time_calculation_windows
    where local_window_end_date between p_starts_on-7 and p_ends_on+7
      and (p_person_ids is null or person_id=any(p_person_ids))
    order by person_id,timezone_name,calculated_at desc,id desc
    limit 500
  ) c;
  return private.working_time_coverage_alert_rows(coalesce(candidate_ids,'{}'::bigint[]),p_starts_on,p_ends_on);
end;
$$;
revoke all on function public.working_time_coverage_alerts(date,date,bigint[]) from public,anon,authenticated;
grant execute on function public.working_time_coverage_alerts(date,date,bigint[]) to authenticated;

-- A recalculation writes many diagnostic rows. Suppress their per-window
-- notifications cheaply inside actual assignments; evaluating the complete
-- solver for each inserted diagnostic row would multiply save latency.
do $migration$
declare definition text; previous text;
begin
  definition:=replace(pg_get_functiondef('public.working_time_queue_non_compliance_notification(bigint)'::regprocedure),chr(13),'');
  previous:=$old$  if calculation.id is null or calculation.is_compliant is distinct from false then
    return 0;
  end if;$old$;
  if (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 then
    raise exception 'Unexpected working-time notification guard';
  end if;
  definition:=replace(definition,previous,previous||$new$
  if exists(select 1 from public.planning_assignments a
    where a.company_id=calculation.company_id and a.crew_person_id=calculation.person_id
      and a.confirmation_status<>'cancelled'
      and calculation.local_window_end_date between a.starts_on and a.ends_on) then
    return 0;
  end if;$new$);
  execute definition;
end;
$migration$;

notify pgrst,'reload schema';
