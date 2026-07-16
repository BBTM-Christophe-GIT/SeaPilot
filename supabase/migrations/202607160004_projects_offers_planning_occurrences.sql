-- Projects follow-up: explicit catalog project -> planning occurrence relationship.
-- One catalog project may be executed zero, one or many times. Existing planning rows remain unlinked.

alter table public.planning_projects
  add column if not exists catalog_project_id bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'planning_projects_catalog_project_company_fkey'
      and conrelid = 'public.planning_projects'::regclass
  ) then
    alter table public.planning_projects
      add constraint planning_projects_catalog_project_company_fkey
      foreign key (catalog_project_id, company_id)
      references public.projects(id, company_id)
      on delete restrict
      not valid;
  end if;
end $$;

create index if not exists planning_projects_catalog_project_dates_idx
  on public.planning_projects (company_id, catalog_project_id, starts_on, ends_on)
  where catalog_project_id is not null;

comment on column public.planning_projects.catalog_project_id is
  'Optional catalog project reference. Several operational planning occurrences may reference the same public.projects row.';

create or replace function public.projects_create_planning_occurrence(
  target_project_id bigint,
  target_starts_on date,
  target_ends_on date,
  target_primary_vessel_id bigint default null,
  target_status text default null,
  target_description text default null
)
returns setof public.planning_projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  catalog_project public.projects%rowtype;
  target_vessel public.vessels%rowtype;
  created_occurrence_id bigint;
begin
  if target_company_id is null then
    raise exception 'No active SeaPilot company' using errcode = '42501';
  end if;

  if not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Insufficient permission to schedule a catalog project' using errcode = '42501';
  end if;

  if target_starts_on is null or target_ends_on is null then
    raise exception 'Planning occurrence dates are required' using errcode = '22023';
  end if;

  if target_ends_on < target_starts_on then
    raise exception 'Planning occurrence end date precedes start date' using errcode = '22023';
  end if;

  select project.*
  into catalog_project
  from public.projects project
  where project.id = target_project_id
    and project.company_id = target_company_id
    and project.archived_at is null;

  if not found then
    raise exception 'Catalog project not found or archived' using errcode = 'P0002';
  end if;

  select vessel.*
  into target_vessel
  from public.vessels vessel
  where vessel.id = coalesce(target_primary_vessel_id, catalog_project.primary_vessel_id)
    and vessel.company_id = target_company_id;

  if not found then
    raise exception 'A vessel from the active company is required' using errcode = '22023';
  end if;

  insert into public.planning_projects (
    company_id,
    catalog_project_id,
    title,
    starts_on,
    ends_on,
    description,
    client_name,
    primary_vessel_id,
    primary_vessel_name,
    secondary_vessel_id,
    secondary_vessel_name,
    event_type,
    status,
    source_label,
    created_at,
    updated_at
  ) values (
    target_company_id,
    catalog_project.id,
    coalesce(nullif(btrim(catalog_project.project_code), ''), 'Projet') || ' - ' || catalog_project.title,
    target_starts_on,
    target_ends_on,
    coalesce(nullif(btrim(target_description), ''), catalog_project.description),
    catalog_project.client_name,
    target_vessel.id,
    target_vessel.name,
    catalog_project.secondary_vessel_id,
    catalog_project.secondary_vessel_name,
    'operation',
    coalesce(nullif(btrim(target_status), ''), 'A planifier'),
    'seapilot-projects',
    now(),
    now()
  )
  returning id into created_occurrence_id;

  return query
  select occurrence.*
  from public.planning_projects occurrence
  where occurrence.id = created_occurrence_id
    and occurrence.company_id = target_company_id;
end;
$$;

revoke all on function public.projects_create_planning_occurrence(bigint, date, date, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.projects_create_planning_occurrence(bigint, date, date, bigint, text, text)
  to authenticated;

comment on function public.projects_create_planning_occurrence(bigint, date, date, bigint, text, text) is
  'Creates one operational planning occurrence from a catalog project. Repeated calls intentionally create distinct occurrences.';
