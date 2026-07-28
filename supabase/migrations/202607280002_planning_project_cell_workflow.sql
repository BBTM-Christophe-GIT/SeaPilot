-- Planning project workflow opened from an empty vessel/day cell.
-- Keeps the commercial catalog in projects and schedules linked operational
-- occurrences in planning_projects.

create or replace function public.planning_project_catalog()
returns table (
  id bigint,
  project_code text,
  title text,
  client_name text,
  status text,
  description text,
  starts_on date,
  ends_on date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']) then
    raise exception 'Insufficient permission to read project catalog' using errcode = '42501';
  end if;

  return query
  select
    project.id,
    project.project_code,
    project.title,
    project.client_name,
    project.status,
    project.description,
    project.starts_on,
    project.ends_on
  from public.projects project
  where project.company_id = target_company_id
    and project.archived_at is null
  order by project.project_code desc nulls last, project.title;
end;
$$;

revoke all on function public.planning_project_catalog() from public, anon, authenticated;
grant execute on function public.planning_project_catalog() to authenticated;

comment on function public.planning_project_catalog() is
  'Read-only project catalog used by the Planning vessel-cell picker. Commercial and contractual fields remain excluded.';

create or replace function public.planning_project_clients()
returns table (
  id bigint,
  name text,
  active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']) then
    raise exception 'Insufficient permission to read project clients' using errcode = '42501';
  end if;

  return query
  select client.id, client.name, client.active
  from public.clients client
  where client.company_id = target_company_id
    and client.archived_at is null
    and client.active
  order by client.name;
end;
$$;

revoke all on function public.planning_project_clients() from public, anon, authenticated;
grant execute on function public.planning_project_clients() to authenticated;

comment on function public.planning_project_clients() is
  'Minimal active client list used by the Planning project identification card.';

create or replace function public.planning_create_project_client(
  target_name text,
  target_code text,
  target_email text,
  target_phone text,
  target_city text,
  target_country text
)
returns table (
  id bigint,
  name text,
  active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  created_client_id bigint;
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction', 'armement']) then
    raise exception 'Insufficient permission to create a project client' using errcode = '42501';
  end if;
  if nullif(btrim(target_name), '') is null then
    raise exception 'Client name is required' using errcode = '22023';
  end if;

  insert into public.clients (
    company_id,
    name,
    code,
    email,
    phone,
    city,
    country,
    active,
    source_label,
    created_at,
    updated_at
  ) values (
    target_company_id,
    btrim(target_name),
    nullif(btrim(target_code), ''),
    nullif(btrim(target_email), ''),
    nullif(btrim(target_phone), ''),
    nullif(btrim(target_city), ''),
    nullif(btrim(target_country), ''),
    true,
    'seapilot-planning',
    now(),
    now()
  )
  returning public.clients.id into created_client_id;

  return query
  select client.id, client.name, client.active
  from public.clients client
  where client.id = created_client_id
    and client.company_id = target_company_id;
end;
$$;

revoke all on function public.planning_create_project_client(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.planning_create_project_client(text, text, text, text, text, text)
  to authenticated;

comment on function public.planning_create_project_client(text, text, text, text, text, text) is
  'Creates a minimal client from the Planning project identification card for admin, direction and armement.';

create or replace function public.planning_schedule_catalog_project(
  target_project_id bigint,
  target_starts_on date,
  target_ends_on date,
  target_primary_vessel_id bigint,
  target_status text,
  target_description text
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
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction', 'armement']) then
    raise exception 'Insufficient permission to schedule a catalog project' using errcode = '42501';
  end if;
  if target_starts_on is null or target_ends_on is null or target_ends_on < target_starts_on then
    raise exception 'A valid Planning date range is required' using errcode = '22023';
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
  where vessel.id = target_primary_vessel_id
    and vessel.company_id = target_company_id
    and vessel.active;

  if not found then
    raise exception 'An active vessel from the current company is required' using errcode = '22023';
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
    'seapilot-planning',
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

revoke all on function public.planning_schedule_catalog_project(bigint, date, date, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.planning_schedule_catalog_project(bigint, date, date, bigint, text, text)
  to authenticated;

comment on function public.planning_schedule_catalog_project(bigint, date, date, bigint, text, text) is
  'Schedules one linked operational occurrence from the Planning vessel-cell picker.';

create or replace function public.planning_create_and_schedule_project(
  target_title text,
  target_client_id bigint,
  target_primary_vessel_id bigint,
  target_starts_on date,
  target_status text,
  target_description text
)
returns setof public.planning_projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_client public.clients%rowtype;
  target_vessel public.vessels%rowtype;
  created_project_id bigint;
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction', 'armement']) then
    raise exception 'Insufficient permission to create a Planning project' using errcode = '42501';
  end if;
  if nullif(btrim(target_title), '') is null then
    raise exception 'Project title is required' using errcode = '22023';
  end if;
  if target_starts_on is null then
    raise exception 'Planning date is required' using errcode = '22023';
  end if;

  if target_client_id is not null then
    select client.*
    into target_client
    from public.clients client
    where client.id = target_client_id
      and client.company_id = target_company_id
      and client.archived_at is null
      and client.active;
    if not found then
      raise exception 'Client not found or inactive' using errcode = 'P0002';
    end if;
  end if;

  select vessel.*
  into target_vessel
  from public.vessels vessel
  where vessel.id = target_primary_vessel_id
    and vessel.company_id = target_company_id
    and vessel.active;
  if not found then
    raise exception 'An active vessel from the current company is required' using errcode = '22023';
  end if;

  insert into public.projects (
    company_id,
    title,
    client_id,
    client_name,
    primary_vessel_id,
    primary_vessel_name,
    starts_on,
    ends_on,
    status,
    description,
    source_label,
    created_at,
    updated_at
  ) values (
    target_company_id,
    btrim(target_title),
    target_client_id,
    case when target_client_id is null then null else target_client.name end,
    target_vessel.id,
    target_vessel.name,
    target_starts_on,
    target_starts_on,
    coalesce(nullif(btrim(target_status), ''), 'A planifier'),
    nullif(btrim(target_description), ''),
    'seapilot-planning',
    now(),
    now()
  )
  returning id into created_project_id;

  return query
  select occurrence.*
  from public.planning_schedule_catalog_project(
    created_project_id,
    target_starts_on,
    target_starts_on,
    target_primary_vessel_id,
    target_status,
    target_description
  ) occurrence;
end;
$$;

revoke all on function public.planning_create_and_schedule_project(text, bigint, bigint, date, text, text)
  from public, anon, authenticated;
grant execute on function public.planning_create_and_schedule_project(text, bigint, bigint, date, text, text)
  to authenticated;

comment on function public.planning_create_and_schedule_project(text, bigint, bigint, date, text, text) is
  'Atomically creates a minimal catalog project and its first one-day Planning occurrence.';
