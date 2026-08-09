-- Make the HSE denominator usable for historical years and apply the company
-- rule: a person-day present in Planning contributes the actual registered
-- duration when available, otherwise it contributes 11 hours.

update public.hse_exposure_methodologies
set
  effective_from = least(effective_from, date '1900-01-01'),
  sedentary_day_hours = 11,
  offshore_actual_hour_factor = coalesce(offshore_actual_hour_factor, 1),
  ltifr_multiplier = coalesce(ltifr_multiplier, 1000000),
  trir_multiplier = coalesce(trir_multiplier, 1000000),
  far_multiplier = coalesce(far_multiplier, 100000000),
  fac_rate_multiplier = coalesce(fac_rate_multiplier, 1000000),
  mtc_rate_multiplier = coalesce(mtc_rate_multiplier, 1000000),
  rwc_rate_multiplier = coalesce(rwc_rate_multiplier, 1000000),
  sofr_multiplier = coalesce(sofr_multiplier, 200000),
  french_frequency_multiplier = coalesce(french_frequency_multiplier, 1000000),
  french_severity_multiplier = coalesce(french_severity_multiplier, 1000),
  notes = concat_ws(E'\n', nullif(notes, ''),
    'Règle SeaPilot : heures réelles du registre si disponibles ; sinon 11 heures par personne et journée présente au Planning. Applicable aux données historiques.'
  )
where name in ('SeaPilot - conversion Planning sédentaire', 'SeaPilot HSE exposure');

create or replace function public.refresh_hse_exposure_hours(
  p_starts_on date,
  p_ends_on date,
  p_methodology_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  method public.hse_exposure_methodologies%rowtype;
  actual_count integer := 0;
  planning_count integer := 0;
begin
  if not public.has_any_role(array['admin','direction','armement']) then raise exception 'HSE_EXPOSURE_FORBIDDEN'; end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then raise exception 'HSE_EXPOSURE_RANGE_INVALID'; end if;

  select * into method
  from public.hse_exposure_methodologies
  where id = p_methodology_id
    and company_id = target_company_id
    and effective_from <= p_ends_on
    and coalesce(effective_to, 'infinity'::date) >= p_starts_on;
  if method.id is null then raise exception 'HSE_EXPOSURE_METHODOLOGY_REQUIRED'; end if;

  delete from public.hse_exposure_hours
  where company_id = target_company_id
    and exposure_date between p_starts_on and p_ends_on
    and source_kind in ('actual_work','planning_day','excel_import');

  insert into public.hse_exposure_hours (
    company_id, person_id, exposure_date, population, source_kind, source_record_key,
    actual_work_seconds, exposure_seconds, methodology_id, vessel_id, watch_group, function_label
  )
  with daily as (
    select
      work_interval.person_id,
      work_interval.local_work_date,
      coalesce(
        person.employment_population,
        case when bool_or(work_interval.vessel_id is not null) then 'offshore' else 'sedentary' end
      ) as population,
      case when bool_or(work_interval.source_type = 'excel_import') then 'excel_import' else 'actual_work' end as source_kind,
      sum(extract(epoch from work_interval.ends_at - work_interval.starts_at))::bigint as actual_seconds,
      max(work_interval.vessel_id) as vessel_id,
      max(work_interval.watch_group) as watch_group,
      max(person.function_label) as function_label
    from public.working_time_intervals work_interval
    join public.people person
      on person.id = work_interval.person_id
     and person.company_id = target_company_id
    where work_interval.company_id = target_company_id
      and work_interval.voided_at is null
      and work_interval.local_work_date between p_starts_on and p_ends_on
    group by work_interval.person_id, work_interval.local_work_date, person.employment_population
  )
  select
    target_company_id,
    daily.person_id,
    daily.local_work_date,
    daily.population,
    daily.source_kind,
    'actual:' || daily.person_id || ':' || daily.local_work_date,
    daily.actual_seconds,
    round(
      daily.actual_seconds
      * case when daily.population = 'offshore' then coalesce(method.offshore_actual_hour_factor, 1) else 1 end
    )::bigint,
    method.id,
    daily.vessel_id,
    daily.watch_group,
    daily.function_label
  from daily;
  get diagnostics actual_count = row_count;

  if method.sedentary_day_hours is not null then
    insert into public.hse_exposure_hours (
      company_id, person_id, exposure_date, population, source_kind, source_record_key,
      actual_work_seconds, exposure_seconds, methodology_id, vessel_id, watch_group, function_label
    )
    with planning_candidates as (
      select
        day_record.person_id,
        day_record.work_date as exposure_date,
        day_record.vessel_id,
        day_record.watch_group,
        coalesce(day_record.function_label, person.function_label) as function_label,
        coalesce(
          person.employment_population,
          case when day_record.vessel_id is not null then 'offshore' else 'sedentary' end
        ) as population
      from public.planning_days day_record
      join public.people person
        on person.id = day_record.person_id
       and person.company_id = target_company_id
      where day_record.company_id = target_company_id
        and day_record.person_id is not null
        and day_record.work_date between p_starts_on and p_ends_on

      union all

      select
        assignment.crew_person_id,
        day_value::date,
        assignment.vessel_id,
        assignment.watch_group,
        coalesce(assignment.assignment_role, person.function_label),
        coalesce(person.employment_population, 'offshore')
      from public.planning_assignments assignment
      join public.people person
        on person.id = assignment.crew_person_id
       and person.company_id = target_company_id
      cross join lateral generate_series(
        greatest(assignment.starts_on, p_starts_on),
        least(assignment.ends_on, p_ends_on),
        interval '1 day'
      ) day_value
      where assignment.company_id = target_company_id

      union all

      select
        assignment.captain_person_id,
        day_value::date,
        assignment.vessel_id,
        assignment.watch_group,
        coalesce(assignment.assignment_role, person.function_label),
        coalesce(person.employment_population, 'offshore')
      from public.planning_assignments assignment
      join public.people person
        on person.id = assignment.captain_person_id
       and person.company_id = target_company_id
      cross join lateral generate_series(
        greatest(assignment.starts_on, p_starts_on),
        least(assignment.ends_on, p_ends_on),
        interval '1 day'
      ) day_value
      where assignment.company_id = target_company_id
        and assignment.captain_person_id is not null
    ), planning_days_deduplicated as (
      select
        candidate.person_id,
        candidate.exposure_date,
        max(candidate.population) as population,
        max(candidate.vessel_id) as vessel_id,
        max(candidate.watch_group) as watch_group,
        max(candidate.function_label) as function_label
      from planning_candidates candidate
      group by candidate.person_id, candidate.exposure_date
    )
    select
      target_company_id,
      planning_day.person_id,
      planning_day.exposure_date,
      planning_day.population,
      'planning_day',
      'planning:' || planning_day.person_id || ':' || planning_day.exposure_date,
      null::bigint,
      round(method.sedentary_day_hours * 3600)::bigint,
      method.id,
      planning_day.vessel_id,
      planning_day.watch_group,
      planning_day.function_label
    from planning_days_deduplicated planning_day
    where not exists (
      select 1
      from public.working_time_intervals work_interval
      where work_interval.company_id = target_company_id
        and work_interval.person_id = planning_day.person_id
        and work_interval.local_work_date = planning_day.exposure_date
        and work_interval.voided_at is null
    )
    on conflict (company_id, source_record_key) do nothing;
    get diagnostics planning_count = row_count;
  end if;

  return jsonb_build_object(
    'actual_days', actual_count,
    'planning_days', planning_count,
    'planning_fallback_hours', method.sedentary_day_hours,
    'methodology_id', method.id
  );
end;
$$;

revoke all on function public.refresh_hse_exposure_hours(date,date,bigint) from public, anon, authenticated;
grant execute on function public.refresh_hse_exposure_hours(date,date,bigint) to authenticated;

comment on function public.refresh_hse_exposure_hours(date,date,bigint) is
  'Rebuilds HSE exposure from actual working-time intervals, falling back to 11 hours for each deduplicated person-day present in Planning.';
