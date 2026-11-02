-- Monthly performance exposes only authorized current personnel and exercise counts.
-- No DPR body, patient, medical, signature or attachment data is returned.
create or replace function private.emergency_exercises_performance(target_year integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  roster jsonb := private.emergency_exercises_people();
  company bigint := public.current_planning_company_id();
  as_of date := (now() at time zone 'Europe/Paris')::date;
  read_ids bigint[] := private.assigned_vessel_read_scope(company);
  payload jsonb;
begin
  if target_year is null or target_year < 1900 or target_year > 2100 then
    raise exception 'Année invalide (1900 à 2100).' using errcode = '22023';
  end if;
  with allowed_people as (
    select person.id, person.first_name, person.last_name, person.hired_on, person.departed_on, person.employment_periods
    from public.people person
    join jsonb_array_elements(roster->'people') authorized on (authorized->>'id')::bigint = person.id
    where person.company_id = company and exists (
      select 1 from jsonb_array_elements(case when jsonb_array_length(person.employment_periods) > 0 then person.employment_periods
        else jsonb_build_array(jsonb_build_object('hiredOn', person.hired_on, 'departedOn', person.departed_on)) end) period
      where nullif(period->>'hiredOn', '')::date <= as_of
        and (nullif(period->>'departedOn', '') is null or (period->>'departedOn')::date > as_of)
    )
  ), allowed_vessels as (
    select (v->>'id')::bigint as id, v->>'name' as name
    from jsonb_array_elements(roster->'vessels') v
    where roster->>'scope' = 'fleet' or (v->>'id')::bigint = any(read_ids)
  ), months as (
    select value::date as month_on, least((value + interval '1 month - 1 day')::date, as_of) as last_on
    from generate_series(make_date(target_year, 1, 1)::timestamp,
      least(make_date(target_year, 12, 1), date_trunc('month', as_of)::date)::timestamp, interval '1 month') value
  ), employment as (
    select p.id, p.first_name, p.last_name, (period->>'hiredOn')::date as hired_on,
      nullif(period->>'departedOn', '')::date as departed_on
    from allowed_people p
    cross join lateral jsonb_array_elements(case when jsonb_array_length(p.employment_periods) > 0 then p.employment_periods
      else jsonb_build_array(jsonb_build_object('hiredOn', p.hired_on, 'departedOn', p.departed_on)) end) period
    where coalesce(period->>'hiredOn', '') <> ''
  ), eligible_units as (
    select distinct p.id as person_id, p.first_name, p.last_name, m.month_on, a.vessel_id
    from employment p
    join public.planning_assignments a on a.company_id = company
      and (a.crew_person_id = p.id or a.captain_person_id = p.id) and a.confirmation_status = 'confirmed'
    join allowed_vessels vessel on vessel.id = a.vessel_id
    cross join months m
    where greatest(m.month_on, p.hired_on, coalesce((a.starts_at at time zone 'Europe/Paris')::date, a.starts_on))
      <= least(m.last_on, coalesce(p.departed_on - 1, m.last_on),
        coalesce(((a.ends_at - interval '1 microsecond') at time zone 'Europe/Paris')::date, a.ends_on))
  ), eligible_months as (
    select distinct person_id, first_name, last_name, month_on from eligible_units
  ), exercise_counts as (
    select crew.person_id, date_trunc('month', report.report_date)::date as month_on, report.vessel_id,
      count(distinct report.id) filter (where exercise.exercise_type_key = 'fire-protection')::integer as fire_count,
      count(distinct report.id) filter (where exercise.exercise_type_key = 'abandon-ship')::integer as abandon_count
    from public.dpr_reports report
    join allowed_vessels vessel on vessel.id = report.vessel_id
    join public.dpr_crew_members crew on crew.dpr_id = report.id and crew.company_id = report.company_id
    join eligible_months eligible on eligible.person_id = crew.person_id
      and eligible.month_on = date_trunc('month', report.report_date)::date
    join public.dpr_emergency_exercises exercise on exercise.dpr_id = report.id and exercise.company_id = report.company_id
      and exercise.exercise_type_key in ('fire-protection', 'abandon-ship')
    where report.company_id = company and report.deleted_at is null and report.status in ('submitted', 'validated')
      and report.report_date between make_date(target_year, 1, 1) and least(make_date(target_year, 12, 31), as_of)
      and exists (select 1 from employment p where p.id = crew.person_id and p.hired_on <= report.report_date
        and (p.departed_on is null or p.departed_on > report.report_date))
    group by crew.person_id, date_trunc('month', report.report_date)::date, report.vessel_id
  ), person_months as (
    select p.person_id, p.first_name, p.last_name, p.month_on,
      coalesce((select sum(c.fire_count) from exercise_counts c where c.person_id = p.person_id and c.month_on = p.month_on), 0) as fire_count,
      coalesce((select sum(c.abandon_count) from exercise_counts c where c.person_id = p.person_id and c.month_on = p.month_on), 0) as abandon_count,
      (select jsonb_agg(jsonb_build_object('vesselId', unit.vessel_id, 'fireCount', coalesce(c.fire_count, 0),
        'abandonCount', coalesce(c.abandon_count, 0)) order by unit.vessel_id)
       from eligible_units unit left join exercise_counts c on c.person_id = unit.person_id
         and c.month_on = unit.month_on and c.vessel_id = unit.vessel_id
       where unit.person_id = p.person_id and unit.month_on = p.month_on) as units
    from eligible_months p
  )
  select jsonb_build_object('scope', roster->>'scope', 'year', target_year, 'asOf', as_of,
    'vessels', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by id) from allowed_vessels), '[]'::jsonb),
    'personMonths', coalesce((select jsonb_agg(jsonb_build_object('personId', person_id,
      'personName', trim(concat_ws(' ', first_name, last_name)), 'month', extract(month from month_on)::integer,
      'fireCount', fire_count, 'abandonCount', abandon_count, 'units', units) order by month_on, person_id)
      from person_months), '[]'::jsonb)) into payload;
  return payload;
end;
$$;

create or replace function public.emergency_exercises_performance(target_year integer)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.emergency_exercises_performance(target_year); $$;
revoke all on function private.emergency_exercises_performance(integer), public.emergency_exercises_performance(integer) from public, anon;
grant execute on function private.emergency_exercises_performance(integer), public.emergency_exercises_performance(integer) to authenticated;
comment on function public.emergency_exercises_performance(integer) is
  'Monthly Fire/Abandon targets for current authorized offshore personnel, employment periods and confirmed planning presence. One row per person/month; unit counts separate; no clinical/DPR body data.';
notify pgrst, 'reload schema';
