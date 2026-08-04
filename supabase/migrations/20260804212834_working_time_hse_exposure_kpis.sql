-- Separate HSE exposure from actual working-time intervals. Regulatory/industry
-- rate multipliers are deliberately nullable and must be configured explicitly.

alter table public.people
  add column if not exists employment_population text;

alter table public.people drop constraint if exists people_employment_population_check;
alter table public.people add constraint people_employment_population_check
  check (employment_population is null or employment_population in ('offshore', 'sedentary'));

alter table public.vessels add column if not exists flag_state text;

create table if not exists public.hse_exposure_methodologies (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict default public.current_planning_company_id(),
  name text not null,
  version_label text not null,
  effective_from date not null,
  effective_to date,
  sedentary_day_hours numeric(6,2),
  offshore_actual_hour_factor numeric(12,6),
  ltifr_multiplier numeric(18,2),
  trir_multiplier numeric(18,2),
  far_multiplier numeric(18,2),
  fac_rate_multiplier numeric(18,2),
  mtc_rate_multiplier numeric(18,2),
  rwc_rate_multiplier numeric(18,2),
  sofr_multiplier numeric(18,2),
  french_frequency_multiplier numeric(18,2),
  french_severity_multiplier numeric(18,2),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  constraint hse_exposure_methodologies_dates_check check (effective_to is null or effective_to >= effective_from),
  constraint hse_exposure_methodologies_values_check check (
    (sedentary_day_hours is null or sedentary_day_hours > 0)
    and (offshore_actual_hour_factor is null or offshore_actual_hour_factor >= 0)
    and (ltifr_multiplier is null or ltifr_multiplier > 0)
    and (trir_multiplier is null or trir_multiplier > 0)
    and (far_multiplier is null or far_multiplier > 0)
    and (fac_rate_multiplier is null or fac_rate_multiplier > 0)
    and (mtc_rate_multiplier is null or mtc_rate_multiplier > 0)
    and (rwc_rate_multiplier is null or rwc_rate_multiplier > 0)
    and (sofr_multiplier is null or sofr_multiplier > 0)
    and (french_frequency_multiplier is null or french_frequency_multiplier > 0)
    and (french_severity_multiplier is null or french_severity_multiplier > 0)
  ),
  unique (company_id, name, version_label)
);

insert into public.hse_exposure_methodologies (
  company_id, name, version_label, effective_from, sedentary_day_hours, notes
)
select company.id, 'SeaPilot - conversion Planning sédentaire', '2026-08', date '2026-01-01', 8,
  'Configuration métier validée : une journée Planning publiée vaut 8 heures. Les multiplicateurs de taux restent à configurer.'
from public.companies company
on conflict (company_id, name, version_label) do nothing;

create table if not exists public.hse_exposure_hours (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict default public.current_planning_company_id(),
  person_id bigint not null references public.people(id) on delete cascade,
  exposure_date date not null,
  population text not null,
  source_kind text not null,
  source_record_key text not null,
  actual_work_seconds bigint,
  exposure_seconds bigint not null,
  methodology_id bigint not null references public.hse_exposure_methodologies(id) on delete restrict,
  vessel_id bigint references public.vessels(id) on delete set null,
  watch_group text,
  function_label text,
  client_id bigint references public.clients(id) on delete set null,
  project_id bigint references public.projects(id) on delete set null,
  geographic_area text,
  generated_at timestamptz not null default now(),
  constraint hse_exposure_hours_population_check check (population in ('offshore', 'sedentary')),
  constraint hse_exposure_hours_source_check check (source_kind in ('actual_work', 'planning_day', 'excel_import', 'manual_adjustment')),
  constraint hse_exposure_hours_values_check check (exposure_seconds >= 0 and (actual_work_seconds is null or actual_work_seconds >= 0)),
  unique (company_id, source_record_key)
);

create table if not exists public.hse_safety_events (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict default public.current_planning_company_id(),
  occurred_on date not null,
  classification text not null,
  person_id bigint references public.people(id) on delete set null,
  population text,
  vessel_id bigint references public.vessels(id) on delete set null,
  watch_group text,
  function_label text,
  client_id bigint references public.clients(id) on delete set null,
  project_id bigint references public.projects(id) on delete set null,
  geographic_area text,
  lost_days numeric(12,2) not null default 0,
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  constraint hse_safety_events_classification_check check (classification in ('FAT', 'LWDC', 'RWC', 'MTC', 'FAC', 'NEAR_MISS', 'SAFETY_OBSERVATION')),
  constraint hse_safety_events_population_check check (population is null or population in ('offshore', 'sedentary')),
  constraint hse_safety_events_lost_days_check check (lost_days >= 0)
);

create index if not exists hse_exposure_hours_filters_idx on public.hse_exposure_hours
  (company_id, exposure_date, population, vessel_id, person_id, project_id, client_id);
create index if not exists hse_safety_events_filters_idx on public.hse_safety_events
  (company_id, occurred_on, classification, population, vessel_id, person_id, project_id, client_id);

alter table public.hse_exposure_methodologies enable row level security;
alter table public.hse_exposure_hours enable row level security;
alter table public.hse_safety_events enable row level security;
revoke all on public.hse_exposure_methodologies, public.hse_exposure_hours, public.hse_safety_events from anon, authenticated;
grant select on public.hse_exposure_methodologies, public.hse_exposure_hours, public.hse_safety_events to authenticated;
grant insert, update on public.hse_exposure_methodologies, public.hse_safety_events to authenticated;

create policy hse_methodologies_read on public.hse_exposure_methodologies for select to authenticated
  using (company_id = public.current_planning_company_id() and public.has_any_role(array['admin','direction','armement','capitaine']));
create policy hse_methodologies_admin_write on public.hse_exposure_methodologies for all to authenticated
  using (company_id = public.current_planning_company_id() and public.has_role('admin'))
  with check (company_id = public.current_planning_company_id() and public.has_role('admin'));
create policy hse_exposure_read on public.hse_exposure_hours for select to authenticated
  using (company_id = public.current_planning_company_id() and public.has_any_role(array['admin','direction','armement','capitaine']));
create policy hse_events_read on public.hse_safety_events for select to authenticated
  using (company_id = public.current_planning_company_id() and public.has_any_role(array['admin','direction','armement','capitaine']));
create policy hse_events_manage on public.hse_safety_events for all to authenticated
  using (company_id = public.current_planning_company_id() and public.has_any_role(array['admin','direction','armement']))
  with check (company_id = public.current_planning_company_id() and public.has_any_role(array['admin','direction','armement']));

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
  select * into method from public.hse_exposure_methodologies
   where id = p_methodology_id and company_id = target_company_id
     and effective_from <= p_ends_on and coalesce(effective_to, 'infinity'::date) >= p_starts_on;
  if method.id is null then raise exception 'HSE_EXPOSURE_METHODOLOGY_REQUIRED'; end if;

  delete from public.hse_exposure_hours
   where company_id = target_company_id and exposure_date between p_starts_on and p_ends_on
     and source_kind in ('actual_work','planning_day','excel_import');

  insert into public.hse_exposure_hours (
      company_id, person_id, exposure_date, population, source_kind, source_record_key,
      actual_work_seconds, exposure_seconds, methodology_id, vessel_id, watch_group, function_label
    )
    with daily as (
      select work_interval.person_id, work_interval.local_work_date,
        coalesce(person.employment_population, case when bool_or(work_interval.vessel_id is not null) then 'offshore' else 'sedentary' end) population,
        case when bool_or(work_interval.source_type = 'excel_import') then 'excel_import' else 'actual_work' end source_kind,
        sum(extract(epoch from work_interval.ends_at - work_interval.starts_at))::bigint actual_seconds,
        max(work_interval.vessel_id) vessel_id, max(work_interval.watch_group) watch_group,
        max(person.function_label) function_label
      from public.working_time_intervals work_interval
      join public.people person on person.id = work_interval.person_id and person.company_id = target_company_id
      where work_interval.company_id = target_company_id and work_interval.voided_at is null
        and work_interval.local_work_date between p_starts_on and p_ends_on
      group by work_interval.person_id, work_interval.local_work_date, person.employment_population
    )
    select target_company_id, daily.person_id, daily.local_work_date, daily.population, daily.source_kind,
      'actual:' || daily.person_id || ':' || daily.local_work_date, daily.actual_seconds,
      round(daily.actual_seconds * case when daily.population = 'sedentary' then 1 else method.offshore_actual_hour_factor end)::bigint,
      method.id, daily.vessel_id, daily.watch_group, daily.function_label
    from daily
    where daily.population = 'sedentary' or method.offshore_actual_hour_factor is not null;
  get diagnostics actual_count = row_count;

  if method.sedentary_day_hours is not null then
    insert into public.hse_exposure_hours (
      company_id, person_id, exposure_date, population, source_kind, source_record_key,
      actual_work_seconds, exposure_seconds, methodology_id, vessel_id, watch_group, function_label
    )
    select distinct target_company_id, assignment.crew_person_id, day_value::date, 'sedentary', 'planning_day',
      'planning:' || assignment.crew_person_id || ':' || day_value::date,
      null::bigint, round(method.sedentary_day_hours * 3600)::bigint, method.id,
      assignment.vessel_id, assignment.watch_group, person.function_label
    from public.planning_assignments assignment
    join public.people person on person.id = assignment.crew_person_id and person.company_id = target_company_id
    cross join lateral generate_series(greatest(assignment.starts_on, p_starts_on), least(assignment.ends_on, p_ends_on), interval '1 day') day_value
    where assignment.company_id = target_company_id
      and person.employment_population = 'sedentary'
      and exists (
        select 1 from public.planning_publications publication
        where publication.company_id = target_company_id and publication.status = 'published'
          and day_value::date between publication.starts_on and publication.ends_on
          and (publication.vessel_id is null or publication.vessel_id = assignment.vessel_id)
      )
      and not exists (
        select 1 from public.working_time_intervals work_interval
        where work_interval.company_id = target_company_id and work_interval.person_id = assignment.crew_person_id
          and work_interval.local_work_date = day_value::date and work_interval.voided_at is null
      )
    on conflict (company_id, source_record_key) do nothing;
    get diagnostics planning_count = row_count;
  end if;

  return jsonb_build_object('actual_days', actual_count, 'planning_days', planning_count, 'methodology_id', method.id);
end;
$$;

create or replace function public.hse_kpi_summary(
  p_starts_on date,
  p_ends_on date,
  p_methodology_id bigint,
  p_vessel_id bigint default null,
  p_watch_group text default null,
  p_person_id bigint default null,
  p_function_label text default null,
  p_client_id bigint default null,
  p_project_id bigint default null,
  p_geographic_area text default null,
  p_population text default null
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  method public.hse_exposure_methodologies%rowtype;
  exposure_hours numeric;
  fat_count integer; lwdc_count integer; rwc_count integer; mtc_count integer; fac_count integer;
  near_miss_count integer; observation_count integer; lost_days numeric;
begin
  if not public.has_any_role(array['admin','direction','armement','capitaine']) then raise exception 'HSE_KPI_FORBIDDEN'; end if;
  select * into method from public.hse_exposure_methodologies where id = p_methodology_id and company_id = target_company_id;
  if method.id is null then raise exception 'HSE_EXPOSURE_METHODOLOGY_REQUIRED'; end if;
  select coalesce(sum(exposure.exposure_seconds),0) / 3600.0 into exposure_hours
  from public.hse_exposure_hours exposure
  where exposure.company_id = target_company_id and exposure.methodology_id = method.id
    and exposure.exposure_date between p_starts_on and p_ends_on
    and (p_vessel_id is null or exposure.vessel_id = p_vessel_id)
    and (p_watch_group is null or exposure.watch_group = p_watch_group)
    and (p_person_id is null or exposure.person_id = p_person_id)
    and (p_function_label is null or exposure.function_label = p_function_label)
    and (p_client_id is null or exposure.client_id = p_client_id)
    and (p_project_id is null or exposure.project_id = p_project_id)
    and (p_geographic_area is null or exposure.geographic_area = p_geographic_area)
    and (p_population is null or exposure.population = p_population);
  select
    count(*) filter (where event.classification='FAT'), count(*) filter (where event.classification='LWDC'),
    count(*) filter (where event.classification='RWC'), count(*) filter (where event.classification='MTC'),
    count(*) filter (where event.classification='FAC'), count(*) filter (where event.classification='NEAR_MISS'),
    count(*) filter (where event.classification='SAFETY_OBSERVATION'), coalesce(sum(event.lost_days),0)
  into fat_count,lwdc_count,rwc_count,mtc_count,fac_count,near_miss_count,observation_count,lost_days
  from public.hse_safety_events event
  where event.company_id=target_company_id and event.occurred_on between p_starts_on and p_ends_on
    and (p_vessel_id is null or event.vessel_id=p_vessel_id) and (p_watch_group is null or event.watch_group=p_watch_group)
    and (p_person_id is null or event.person_id=p_person_id) and (p_function_label is null or event.function_label=p_function_label)
    and (p_client_id is null or event.client_id=p_client_id) and (p_project_id is null or event.project_id=p_project_id)
    and (p_geographic_area is null or event.geographic_area=p_geographic_area) and (p_population is null or event.population=p_population);
  return jsonb_build_object(
    'methodology_id',method.id,'methodology_version',method.version_label,'exposure_hours',exposure_hours,
    'FAT',fat_count,'LWDC',lwdc_count,'RWC',rwc_count,'MTC',mtc_count,'FAC',fac_count,
    'near_miss',near_miss_count,'safety_observation',observation_count,'LTI',fat_count+lwdc_count,
    'LTIFR',case when exposure_hours>0 and method.ltifr_multiplier is not null then (fat_count+lwdc_count)*method.ltifr_multiplier/exposure_hours end,
    'TRIR',case when exposure_hours>0 and method.trir_multiplier is not null then (fat_count+lwdc_count+rwc_count+mtc_count)*method.trir_multiplier/exposure_hours end,
    'FAR',case when exposure_hours>0 and method.far_multiplier is not null then fat_count*method.far_multiplier/exposure_hours end,
    'FAC_rate',case when exposure_hours>0 and method.fac_rate_multiplier is not null then fac_count*method.fac_rate_multiplier/exposure_hours end,
    'MTC_rate',case when exposure_hours>0 and method.mtc_rate_multiplier is not null then mtc_count*method.mtc_rate_multiplier/exposure_hours end,
    'RWC_rate',case when exposure_hours>0 and method.rwc_rate_multiplier is not null then rwc_count*method.rwc_rate_multiplier/exposure_hours end,
    'SOFR',case when exposure_hours>0 and method.sofr_multiplier is not null then observation_count*method.sofr_multiplier/exposure_hours end,
    'french_frequency_rate',case when exposure_hours>0 and method.french_frequency_multiplier is not null then (fat_count+lwdc_count)*method.french_frequency_multiplier/exposure_hours end,
    'french_severity_rate',case when exposure_hours>0 and method.french_severity_multiplier is not null then lost_days*method.french_severity_multiplier/exposure_hours end,
    'lost_days',lost_days,
    'configuration_complete', method.ltifr_multiplier is not null and method.trir_multiplier is not null and method.far_multiplier is not null
  );
end;
$$;

revoke all on function public.refresh_hse_exposure_hours(date,date,bigint) from public, anon, authenticated;
revoke all on function public.hse_kpi_summary(date,date,bigint,bigint,text,bigint,text,bigint,bigint,text,text) from public, anon, authenticated;
grant execute on function public.refresh_hse_exposure_hours(date,date,bigint) to authenticated;
grant execute on function public.hse_kpi_summary(date,date,bigint,bigint,text,bigint,text,bigint,bigint,text,text) to authenticated;

comment on table public.hse_exposure_hours is 'HSE/IMCA exposure ledger, separate from actual working-time intervals. Derived rows retain their methodology version.';
comment on function public.refresh_hse_exposure_hours(date,date,bigint) is 'Rebuilds derived exposure days. Published sedentary Planning days are suppressed whenever actual/imported time exists.';
