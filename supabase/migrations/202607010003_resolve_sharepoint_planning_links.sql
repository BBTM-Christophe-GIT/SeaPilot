create or replace function public.normalize_import_label(value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(
    trim(
      regexp_replace(
        regexp_replace(lower(coalesce(value, '')), '[^[:alnum:]]+', ' ', 'g'),
        '\s+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

create or replace function public.resolve_sharepoint_planning_links()
returns table (
  target_table text,
  resolved_people integer,
  resolved_vessels integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  planning_days_people integer := 0;
  planning_days_vessels integer := 0;
  planning_periods_people integer := 0;
  planning_periods_vessels integer := 0;
  planning_projects_primary_vessels integer := 0;
  planning_projects_secondary_vessels integer := 0;
begin
  update public.planning_days day
  set person_id = person.id,
      updated_at = now()
  from public.people person
  where day.person_id is null
    and public.normalize_import_label(day.crew_name) is not null
    and (
      public.normalize_import_label(day.crew_name) =
        public.normalize_import_label(concat_ws(' ', person.first_name, person.last_name))
      or public.normalize_import_label(day.crew_name) =
        public.normalize_import_label(concat_ws(' ', person.last_name, person.first_name))
    );

  get diagnostics planning_days_people = row_count;

  update public.planning_days day
  set vessel_id = vessel.id,
      updated_at = now()
  from public.vessels vessel
  where day.vessel_id is null
    and public.normalize_import_label(coalesce(day.vessel_name, day.manual_vessel_name)) is not null
    and (
      public.normalize_import_label(coalesce(day.vessel_name, day.manual_vessel_name)) =
        public.normalize_import_label(vessel.name)
      or public.normalize_import_label(coalesce(day.vessel_name, day.manual_vessel_name)) =
        public.normalize_import_label(vessel.acronym)
    );

  get diagnostics planning_days_vessels = row_count;

  update public.planning_periods period
  set person_id = person.id,
      updated_at = now()
  from public.people person
  where period.person_id is null
    and public.normalize_import_label(period.crew_name) is not null
    and (
      public.normalize_import_label(period.crew_name) =
        public.normalize_import_label(concat_ws(' ', person.first_name, person.last_name))
      or public.normalize_import_label(period.crew_name) =
        public.normalize_import_label(concat_ws(' ', person.last_name, person.first_name))
    );

  get diagnostics planning_periods_people = row_count;

  update public.planning_periods period
  set vessel_id = vessel.id,
      updated_at = now()
  from public.vessels vessel
  where period.vessel_id is null
    and public.normalize_import_label(coalesce(period.vessel_name, period.manual_vessel_name)) is not null
    and (
      public.normalize_import_label(coalesce(period.vessel_name, period.manual_vessel_name)) =
        public.normalize_import_label(vessel.name)
      or public.normalize_import_label(coalesce(period.vessel_name, period.manual_vessel_name)) =
        public.normalize_import_label(vessel.acronym)
    );

  get diagnostics planning_periods_vessels = row_count;

  update public.planning_projects project
  set primary_vessel_id = vessel.id,
      updated_at = now()
  from public.vessels vessel
  where project.primary_vessel_id is null
    and public.normalize_import_label(project.primary_vessel_name) is not null
    and (
      public.normalize_import_label(project.primary_vessel_name) = public.normalize_import_label(vessel.name)
      or public.normalize_import_label(project.primary_vessel_name) = public.normalize_import_label(vessel.acronym)
    );

  get diagnostics planning_projects_primary_vessels = row_count;

  update public.planning_projects project
  set secondary_vessel_id = vessel.id,
      updated_at = now()
  from public.vessels vessel
  where project.secondary_vessel_id is null
    and public.normalize_import_label(project.secondary_vessel_name) is not null
    and (
      public.normalize_import_label(project.secondary_vessel_name) = public.normalize_import_label(vessel.name)
      or public.normalize_import_label(project.secondary_vessel_name) = public.normalize_import_label(vessel.acronym)
    );

  get diagnostics planning_projects_secondary_vessels = row_count;

  return query
  values
    ('planning_days', planning_days_people, planning_days_vessels),
    ('planning_periods', planning_periods_people, planning_periods_vessels),
    (
      'planning_projects',
      0,
      planning_projects_primary_vessels + planning_projects_secondary_vessels
    );
end;
$$;

revoke all on function public.normalize_import_label(text) from public;
revoke all on function public.resolve_sharepoint_planning_links() from public;

grant execute on function public.normalize_import_label(text) to authenticated;
grant execute on function public.resolve_sharepoint_planning_links() to authenticated;
