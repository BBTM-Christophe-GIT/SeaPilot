-- Daily, permission-scoped crew obligations. Future dates in the current month
-- are planned presence only: submitted/validated DPR evidence stops at Paris today.
-- Version 1 fields remain available while version 2 exposes the active catalogue,
-- all exercise counts, TBT bonus counts and aggregate daily crew sizes.
create or replace function private.emergency_exercises_performance(target_year integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  roster jsonb := private.emergency_exercises_people();
  company bigint := public.current_planning_company_id();
  as_of date := (now() at time zone 'Europe/Paris')::date;
  read_ids bigint[] := private.assigned_vessel_read_scope(company);
  first_on date;
  last_on date;
  payload jsonb;
begin
  if target_year is null or target_year < 1900 or target_year > 2100 then
    raise exception 'Année invalide (1900 à 2100).' using errcode = '22023';
  end if;
  first_on := make_date(target_year, 1, 1);
  last_on := least(make_date(target_year, 12, 31), (date_trunc('month', as_of) + interval '1 month - 1 day')::date);

  with allowed_people as materialized (
    -- The existing roster guards authentication, company, module and real profile.
    -- Historical employment is evaluated on each day, never via roster.current.
    select p.id, p.first_name, p.last_name, p.hired_on, p.departed_on, p.employment_periods
    from public.people p
    join jsonb_array_elements(roster->'people') authorized on (authorized->>'id')::bigint = p.id
    where p.company_id = company
  ), allowed_vessels as materialized (
    -- A first DPR is not a prerequisite for an authorized vessel's obligations.
    select v.id, v.name from public.vessels v
    where v.company_id = company and v.active and v.asset_kind = 'vessel'
      and (roster->>'scope' = 'fleet' or v.id = any(read_ids))
  ), exercise_types as materialized (
    select t.key, t.label, t.display_order,
      case when t.key in ('fire-protection', 'abandon-ship') then 1 else 2 end as cadence_months
    from public.emergency_exercise_types t where t.active and t.key <> 'tbt'
  ), employment as materialized (
    select p.id, (period->>'hiredOn')::date as hired_on, nullif(period->>'departedOn', '')::date as departed_on
    from allowed_people p
    cross join lateral jsonb_array_elements(case when jsonb_array_length(p.employment_periods) > 0 then p.employment_periods
      else jsonb_build_array(jsonb_build_object('hiredOn', p.hired_on, 'departedOn', p.departed_on)) end) period
    where coalesce(period->>'hiredOn', '') <> ''
  ), assignment_days as materialized (
    -- captain_person_id is the responsible officer, not proof of their presence.
    select a.crew_person_id as person_id, a.vessel_id, d.on_day::date as on_day,
      a.id as source_id, a.updated_at, coalesce(nullif(trim(a.status_label), ''), 'En Mer') as status
    from public.planning_assignments a
    join allowed_people p on p.id = a.crew_person_id
    join public.vessels v on v.id = a.vessel_id and v.company_id = company
    cross join lateral generate_series(
      greatest(first_on, coalesce((a.starts_at at time zone 'Europe/Paris')::date, a.starts_on))::timestamp,
      least(last_on, coalesce(((a.ends_at - interval '1 microsecond') at time zone 'Europe/Paris')::date, a.ends_on))::timestamp,
      interval '1 day') d(on_day)
    where a.company_id = company and a.confirmation_status = 'confirmed'
      and a.starts_on <= last_on and a.ends_on >= first_on
  ), selected_assignments as materialized (
    -- Same priority and vessel: the last saved source wins (latestPlanningSources).
    select distinct on (person_id, vessel_id, on_day) * from assignment_days
    order by person_id, vessel_id, on_day, updated_at desc, source_id desc
  ), period_days as (
    select p.person_id, p.vessel_id, d.on_day::date as on_day, 1 as priority,
      p.id as source_id, p.updated_at, p.sailor_status as status
    from public.planning_periods p join allowed_people person on person.id = p.person_id
    cross join lateral generate_series(greatest(first_on, p.starts_on)::timestamp,
      least(last_on, p.ends_on)::timestamp, interval '1 day') d(on_day)
    where p.company_id = company and (p.vessel_id is null or exists (select 1 from public.vessels v where v.id = p.vessel_id and v.company_id = company))
      and p.starts_on <= last_on and p.ends_on >= first_on
  ), daily_states as (
    select d.person_id, d.vessel_id, d.work_date as on_day, 3 as priority,
      d.id as source_id, d.updated_at, coalesce(nullif(trim(d.sailor_status), ''), d.day_status) as status
    from public.planning_days d join allowed_people person on person.id = d.person_id
    where d.company_id = company and d.work_date between first_on and last_on
      and d.source_label is distinct from 'seapilot-vessel-location'
      and (d.vessel_id is null or exists (select 1 from public.vessels v where v.id = d.vessel_id and v.company_id = company))
      and (d.source_label is distinct from 'seapilot-assignment-note' or exists (
        select 1 from selected_assignments a where a.person_id = d.person_id and a.vessel_id = d.vessel_id
          and a.on_day = d.work_date and d.slot365 = 'assignment:' || a.source_id::text
      ))
  ), sources as (
    select * from period_days
    union all select person_id, vessel_id, on_day, 2, source_id, updated_at, status from selected_assignments
    union all select * from daily_states
  ), latest_sources as (
    select distinct on (person_id, vessel_id, on_day, priority) * from sources
    order by person_id, vessel_id, on_day, priority, updated_at desc, source_id desc
  ), prioritized_sources as (
    select s.*, max(priority) over (partition by person_id, on_day) as effective_priority,
      regexp_replace(translate(upper(coalesce(status, '')), 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
        'AAAAAACEEEEIIIINOOOOOUUUUY'), '[^A-Z0-9]+', '', 'g') as normalized_status
    from latest_sources s
  ), effective_days as (
    -- Conflicting ships or a non-onboard daily state must not invent presence.
    select person_id, on_day, min(vessel_id) as vessel_id
    from prioritized_sources where priority = effective_priority
    group by person_id, on_day
    having count(distinct vessel_id) = 1 and bool_and(vessel_id is not null)
      and bool_and(normalized_status in ('ENMER', 'EMBARQUE', 'EMBARQUEMENT', 'TRAVAILLE'))
  ), presence_days as materialized (
    -- Resolve daily priorities and conflicts across the authorized person's
    -- company sources FIRST. Hiding an out-of-scope conflicting source must not
    -- create fictitious presence on the visible vessel. Only the resulting
    -- allowed vessel can enter the payload; hidden names/IDs never leave SQL.
    select d.* from effective_days d join allowed_vessels v on v.id = d.vessel_id
    where exists (select 1 from employment e where e.id = d.person_id and e.hired_on <= d.on_day
      and (e.departed_on is null or e.departed_on > d.on_day))
      and not exists (
        select 1 from public.planning_absences a where a.company_id = company and a.person_id = d.person_id
          and a.status = 'approved'
          and d.on_day between (a.starts_at at time zone 'Europe/Paris')::date
            and ((a.ends_at - interval '1 microsecond') at time zone 'Europe/Paris')::date
      )
  ), unit_months as materialized (
    select person_id, vessel_id, extract(month from on_day)::integer as month, count(*)::integer as presence_days
    from presence_days group by person_id, vessel_id, extract(month from on_day)
  ), person_months as (
    select person_id, extract(month from on_day)::integer as month, count(distinct on_day)::integer as presence_days
    from presence_days group by person_id, extract(month from on_day)
  ), report_participations as materialized (
    -- Same person, ship and eligible day. Duplicate crew functions cannot multiply a DPR.
    select distinct r.id, r.vessel_id, c.person_id, extract(month from r.report_date)::integer as month
    from public.dpr_reports r join public.dpr_crew_members c on c.dpr_id = r.id and c.company_id = r.company_id
    join presence_days p on p.person_id = c.person_id and p.vessel_id = r.vessel_id and p.on_day = r.report_date
    where r.company_id = company and r.deleted_at is null and r.status in ('submitted', 'validated')
      and r.report_date between first_on and least(make_date(target_year, 12, 31), as_of)
  ), exercise_counts as materialized (
    select r.person_id, r.vessel_id, r.month, e.exercise_type_key as key, count(distinct r.id)::integer as count
    from report_participations r join public.dpr_emergency_exercises e on e.dpr_id = r.id and e.company_id = company
    join exercise_types t on t.key = e.exercise_type_key
    group by r.person_id, r.vessel_id, r.month, e.exercise_type_key
  ), tbt_counts as materialized (
    select r.person_id, r.vessel_id, r.month, count(distinct r.id)::integer as count
    from report_participations r join public.dpr_hse_actions h on h.dpr_id = r.id and h.company_id = company and h.tbt_performed
    group by r.person_id, r.vessel_id, r.month
  ), unit_payloads as materialized (
    select u.*, coalesce((select jsonb_object_agg(t.key, coalesce(c.count, 0)) from exercise_types t
      left join exercise_counts c on c.key = t.key and c.person_id = u.person_id and c.vessel_id = u.vessel_id and c.month = u.month), '{}'::jsonb) as counts,
      coalesce((select c.count from tbt_counts c where c.person_id = u.person_id and c.vessel_id = u.vessel_id and c.month = u.month), 0) as tbt_count
    from unit_months u
  ), monthly_payloads as (
    select m.*, p.first_name, p.last_name,
      coalesce((select jsonb_object_agg(t.key, coalesce((select sum(c.count) from exercise_counts c
        where c.person_id = m.person_id and c.month = m.month and c.key = t.key), 0)) from exercise_types t), '{}'::jsonb) as counts,
      coalesce((select sum(c.count) from tbt_counts c where c.person_id = m.person_id and c.month = m.month), 0) as tbt_count,
      (select jsonb_agg(jsonb_build_object('vesselId', u.vessel_id,
        'fireCount', coalesce((u.counts->>'fire-protection')::integer, 0),
        'abandonCount', coalesce((u.counts->>'abandon-ship')::integer, 0),
        'counts', u.counts, 'tbtCount', u.tbt_count, 'presenceDays', u.presence_days) order by u.vessel_id)
       from unit_payloads u where u.person_id = m.person_id and u.month = m.month) as units
    from person_months m join allowed_people p on p.id = m.person_id
  )
  select jsonb_build_object('schemaVersion', 2, 'scope', roster->>'scope', 'year', target_year, 'asOf', as_of,
    'exerciseTypes', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'cadenceMonths', cadence_months)
      order by display_order, key) from exercise_types), '[]'::jsonb),
    'vessels', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by id) from allowed_vessels), '[]'::jsonb),
    'personMonths', coalesce((select jsonb_agg(jsonb_build_object('personId', person_id,
      'personName', trim(concat_ws(' ', first_name, last_name)), 'month', month,
      'fireCount', coalesce((counts->>'fire-protection')::integer, 0),
      'abandonCount', coalesce((counts->>'abandon-ship')::integer, 0),
      'counts', counts, 'tbtCount', tbt_count, 'presenceDays', presence_days, 'units', units)
      order by month, person_id) from monthly_payloads), '[]'::jsonb),
    'crewDays', coalesce((select jsonb_agg(jsonb_build_object('vesselId', v.id, 'on', d.on_day::date, 'count', coalesce(p.count, 0))
      order by d.on_day, v.id)
      from allowed_vessels v
      cross join generate_series(first_on::timestamp, last_on::timestamp, interval '1 day') d(on_day)
      left join (select vessel_id, on_day, count(distinct person_id)::integer as count
        from presence_days group by vessel_id, on_day) p on p.vessel_id = v.id and p.on_day = d.on_day::date), '[]'::jsonb)) into payload;
  return payload;
end;
$$;

-- Existing public invoker wrapper and grants remain deliberately unchanged.
comment on function public.emergency_exercises_performance(integer) is
  'V2: daily confirmed onboard crew, employment on the occupied day, current-month forecasts, active exercise cadence and distinct DPR/TBT counts. Real role/company/module/read-window scope; no clinical or DPR body data.';
notify pgrst, 'reload schema';
