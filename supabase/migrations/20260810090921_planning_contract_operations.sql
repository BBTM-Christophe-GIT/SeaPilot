-- Planning operations belong to one commercial project/contract and may involve
-- any number of vessels. Financial operation fields remain restricted to Admin
-- and Direction, including through the Data API.

create table if not exists public.planning_operation_vessels (
  planning_occurrence_id bigint not null
    references public.planning_projects(id) on delete cascade,
  company_id bigint not null
    references public.companies(id) on delete cascade,
  vessel_id bigint not null
    references public.vessels(id) on delete restrict,
  position integer not null,
  created_at timestamptz not null default now(),
  primary key (planning_occurrence_id, vessel_id),
  unique (planning_occurrence_id, position),
  check (position > 0)
);

create index if not exists planning_operation_vessels_company_idx
  on public.planning_operation_vessels(company_id, vessel_id);
create index if not exists planning_operation_vessels_vessel_idx
  on public.planning_operation_vessels(vessel_id, planning_occurrence_id);

alter table public.planning_operation_vessels enable row level security;

drop policy if exists planning_operation_vessels_role_read on public.planning_operation_vessels;
create policy planning_operation_vessels_role_read
  on public.planning_operation_vessels
  for select
  to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction', 'armement', 'capitaine']))
  );

revoke all on table public.planning_operation_vessels from public, anon, authenticated;
grant select on table public.planning_operation_vessels to authenticated;
grant all on table public.planning_operation_vessels to service_role;

insert into public.planning_operation_vessels (
  planning_occurrence_id,
  company_id,
  vessel_id,
  position
)
select occurrence.id, occurrence.company_id, vessel.vessel_id, vessel.position
from public.planning_projects occurrence
cross join lateral (
  values
    (occurrence.primary_vessel_id, 1),
    (occurrence.secondary_vessel_id, 2)
) as vessel(vessel_id, position)
where vessel.vessel_id is not null
on conflict (planning_occurrence_id, vessel_id) do nothing;

create or replace function public.sync_planning_operation_legacy_vessels()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.primary_vessel_id is distinct from old.primary_vessel_id
     or new.secondary_vessel_id is distinct from old.secondary_vessel_id then
    delete from public.planning_operation_vessels link
    where link.planning_occurrence_id = new.id
      and (
        link.position in (1, 2)
        or link.vessel_id in (new.primary_vessel_id, new.secondary_vessel_id)
      );

    if new.primary_vessel_id is not null then
      insert into public.planning_operation_vessels (
        planning_occurrence_id,
        company_id,
        vessel_id,
        position
      ) values (new.id, new.company_id, new.primary_vessel_id, 1)
      on conflict (planning_occurrence_id, vessel_id) do update
        set position = excluded.position,
            company_id = excluded.company_id;
    end if;

    if new.secondary_vessel_id is not null
       and new.secondary_vessel_id is distinct from new.primary_vessel_id then
      insert into public.planning_operation_vessels (
        planning_occurrence_id,
        company_id,
        vessel_id,
        position
      ) values (new.id, new.company_id, new.secondary_vessel_id, 2)
      on conflict (planning_occurrence_id, vessel_id) do update
        set position = excluded.position,
            company_id = excluded.company_id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_planning_operation_legacy_vessels()
  from public, anon, authenticated;

drop trigger if exists planning_projects_sync_operation_vessels on public.planning_projects;
create trigger planning_projects_sync_operation_vessels
after insert or update of primary_vessel_id, secondary_vessel_id
on public.planning_projects
for each row
execute function public.sync_planning_operation_legacy_vessels();

drop view if exists public.planning_operations_view;
create view public.planning_operations_view
with (security_invoker = true)
as
select
  occurrence.id,
  occurrence.catalog_project_id,
  occurrence.title,
  occurrence.starts_on,
  occurrence.ends_on,
  occurrence.description,
  occurrence.client_name,
  occurrence.primary_vessel_id,
  occurrence.primary_vessel_name,
  occurrence.secondary_vessel_id,
  occurrence.secondary_vessel_name,
  occurrence.event_type,
  occurrence.responsible_name,
  occurrence.status,
  occurrence.cancelled_at,
  occurrence.cancellation_reason,
  occurrence.source_label,
  coalesce((
    select array_agg(link.vessel_id order by link.position)
    from public.planning_operation_vessels link
    where link.planning_occurrence_id = occurrence.id
  ), array[]::bigint[]) as vessel_ids,
  coalesce((
    select array_agg(vessel.name order by link.position)
    from public.planning_operation_vessels link
    join public.vessels vessel on vessel.id = link.vessel_id
    where link.planning_occurrence_id = occurrence.id
  ), array[]::text[]) as vessel_names
from public.planning_projects occurrence;

revoke all on table public.planning_operations_view from public, anon, authenticated;
grant select on table public.planning_operations_view to authenticated;

-- A table-level SELECT grant would expose the financial snapshot to every
-- Planning reader. Replace it with explicit non-financial column grants.
revoke select on table public.planning_projects from authenticated;
grant select (
  id,
  title,
  starts_on,
  ends_on,
  description,
  client_name,
  primary_vessel_id,
  primary_vessel_name,
  secondary_vessel_id,
  secondary_vessel_name,
  status,
  source_label,
  sharepoint_site_url,
  sharepoint_list_id,
  sharepoint_list_title,
  sharepoint_item_id,
  sharepoint_unique_id,
  sharepoint_file_ref,
  sharepoint_encoded_abs_url,
  source_modified_at,
  created_at,
  updated_at,
  event_type,
  responsible_name,
  company_id,
  catalog_project_id,
  cancelled_at,
  cancelled_by,
  cancellation_reason
) on table public.planning_projects to authenticated;

drop function if exists public.projects_planning_occurrences();
create function public.projects_planning_occurrences()
returns table (
  id bigint,
  catalog_project_id bigint,
  starts_on date,
  ends_on date,
  status text,
  description text,
  charter_hire numeric,
  hire_currency text,
  hire_unit text,
  source_label text,
  created_at timestamptz,
  vessel_ids bigint[],
  vessel_names text[]
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
     or not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Insufficient permission to read operation charter hire' using errcode = '42501';
  end if;

  return query
  select
    occurrence.id,
    occurrence.catalog_project_id,
    occurrence.starts_on,
    coalesce(occurrence.ends_on, occurrence.starts_on),
    occurrence.status,
    occurrence.description,
    occurrence.charter_hire,
    occurrence.hire_currency,
    occurrence.hire_unit,
    occurrence.source_label,
    occurrence.created_at,
    coalesce((
      select array_agg(link.vessel_id order by link.position)
      from public.planning_operation_vessels link
      where link.planning_occurrence_id = occurrence.id
    ), array[]::bigint[]),
    coalesce((
      select array_agg(vessel.name order by link.position)
      from public.planning_operation_vessels link
      join public.vessels vessel on vessel.id = link.vessel_id
      where link.planning_occurrence_id = occurrence.id
    ), array[]::text[])
  from public.planning_projects occurrence
  where occurrence.company_id = target_company_id
    and occurrence.catalog_project_id is not null
  order by occurrence.id;
end;
$$;

revoke all on function public.projects_planning_occurrences()
  from public, anon, authenticated;
grant execute on function public.projects_planning_occurrences()
  to authenticated;

drop function if exists public.projects_save_planning_occurrence(
  bigint, bigint, date, date, bigint, text, text, numeric, text, text
);
create function public.projects_save_planning_occurrence(
  target_occurrence_id bigint,
  target_project_id bigint,
  target_starts_on date,
  target_ends_on date,
  target_vessel_ids bigint[],
  target_status text,
  target_description text,
  target_charter_hire numeric,
  target_hire_currency text,
  target_hire_unit text
)
returns table (id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  catalog_project public.projects%rowtype;
  contract_snapshot public.project_contracts%rowtype;
  normalized_vessel_ids bigint[];
  primary_vessel public.vessels%rowtype;
  secondary_vessel public.vessels%rowtype;
  saved_occurrence_id bigint;
  effective_hire numeric;
  effective_currency text;
  effective_unit text;
  can_manage_hire boolean := public.has_any_role(array['admin', 'direction']);
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction', 'armement']) then
    raise exception 'Insufficient permission to save a project operation' using errcode = '42501';
  end if;

  if target_starts_on is null or target_ends_on is null or target_ends_on < target_starts_on then
    raise exception 'A valid operation date range is required' using errcode = '22023';
  end if;

  select array_agg(candidate.vessel_id order by candidate.first_position)
  into normalized_vessel_ids
  from (
    select vessel_id, min(position) as first_position
    from unnest(coalesce(target_vessel_ids, array[]::bigint[]))
      with ordinality as requested(vessel_id, position)
    where vessel_id is not null
    group by vessel_id
  ) candidate;

  if coalesce(cardinality(normalized_vessel_ids), 0) = 0 then
    raise exception 'At least one active vessel is required' using errcode = '22023';
  end if;

  if (
    select count(*)
    from public.vessels vessel
    where vessel.id = any(normalized_vessel_ids)
      and vessel.company_id = target_company_id
      and vessel.active
  ) <> cardinality(normalized_vessel_ids) then
    raise exception 'Every operation vessel must be active and belong to the current company' using errcode = '22023';
  end if;

  select vessel.* into primary_vessel
  from public.vessels vessel
  where vessel.id = normalized_vessel_ids[1];

  if cardinality(normalized_vessel_ids) > 1 then
    select vessel.* into secondary_vessel
    from public.vessels vessel
    where vessel.id = normalized_vessel_ids[2];
  end if;

  select project.* into catalog_project
  from public.projects project
  where project.id = target_project_id
    and project.company_id = target_company_id
    and project.archived_at is null;

  if not found then
    raise exception 'Catalog project not found or archived' using errcode = 'P0002';
  end if;

  select contract.* into contract_snapshot
  from public.project_contracts contract
  where contract.company_id = target_company_id
    and contract.project_id = catalog_project.id
    and contract.archived_at is null
  order by contract.id desc
  limit 1;

  if not can_manage_hire
     and (target_charter_hire is not null
       or nullif(btrim(target_hire_currency), '') is not null
       or nullif(btrim(target_hire_unit), '') is not null) then
    raise exception 'Only Admin and Direction may set operation charter hire' using errcode = '42501';
  end if;

  if target_occurrence_id is null then
    effective_hire := case
      when can_manage_hire then coalesce(target_charter_hire, contract_snapshot.charter_hire)
      else contract_snapshot.charter_hire
    end;
    effective_currency := case
      when can_manage_hire then coalesce(
        nullif(upper(btrim(target_hire_currency)), ''),
        nullif(upper(btrim(contract_snapshot.hire_currency)), '')
      )
      else nullif(upper(btrim(contract_snapshot.hire_currency)), '')
    end;
    effective_unit := case
      when can_manage_hire then coalesce(
        nullif(btrim(target_hire_unit), ''),
        nullif(btrim(contract_snapshot.hire_unit), '')
      )
      else nullif(btrim(contract_snapshot.hire_unit), '')
    end;
  else
    effective_hire := target_charter_hire;
    effective_currency := nullif(upper(btrim(target_hire_currency)), '');
    effective_unit := nullif(btrim(target_hire_unit), '');
  end if;

  if effective_hire is not null and effective_hire < 0 then
    raise exception 'Operation charter hire cannot be negative' using errcode = '22023';
  end if;
  if effective_hire is not null
     and (effective_currency is null or effective_currency !~ '^[A-Z]{3}$') then
    raise exception 'A three-letter currency is required for operation charter hire' using errcode = '22023';
  end if;

  if target_occurrence_id is null then
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
      charter_hire,
      hire_currency,
      hire_unit,
      source_label,
      created_at,
      updated_at
    ) values (
      target_company_id,
      catalog_project.id,
      coalesce(nullif(btrim(catalog_project.project_code), ''), 'Projet') || ' - ' || catalog_project.title,
      target_starts_on,
      target_ends_on,
      nullif(btrim(target_description), ''),
      catalog_project.client_name,
      primary_vessel.id,
      primary_vessel.name,
      secondary_vessel.id,
      secondary_vessel.name,
      'operation',
      coalesce(nullif(btrim(target_status), ''), 'Non validé'),
      effective_hire,
      effective_currency,
      effective_unit,
      'seapilot-projects',
      now(),
      now()
    )
    returning public.planning_projects.id into saved_occurrence_id;
  else
    update public.planning_projects occurrence
    set
      starts_on = target_starts_on,
      ends_on = target_ends_on,
      description = nullif(btrim(target_description), ''),
      primary_vessel_id = primary_vessel.id,
      primary_vessel_name = primary_vessel.name,
      secondary_vessel_id = secondary_vessel.id,
      secondary_vessel_name = secondary_vessel.name,
      status = coalesce(nullif(btrim(target_status), ''), occurrence.status),
      charter_hire = case
        when can_manage_hire then coalesce(effective_hire, occurrence.charter_hire)
        else occurrence.charter_hire
      end,
      hire_currency = case
        when can_manage_hire then coalesce(effective_currency, occurrence.hire_currency)
        else occurrence.hire_currency
      end,
      hire_unit = case
        when can_manage_hire then coalesce(effective_unit, occurrence.hire_unit)
        else occurrence.hire_unit
      end,
      updated_at = now()
    where occurrence.id = target_occurrence_id
      and occurrence.company_id = target_company_id
      and occurrence.catalog_project_id = catalog_project.id
    returning occurrence.id into saved_occurrence_id;

    if saved_occurrence_id is null then
      raise exception 'Project operation not found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.planning_operation_vessels link
  where link.planning_occurrence_id = saved_occurrence_id;

  insert into public.planning_operation_vessels (
    planning_occurrence_id,
    company_id,
    vessel_id,
    position
  )
  select saved_occurrence_id, target_company_id, requested.vessel_id, requested.position::integer
  from unnest(normalized_vessel_ids) with ordinality as requested(vessel_id, position);

  return query select saved_occurrence_id;
end;
$$;

revoke all on function public.projects_save_planning_occurrence(
  bigint, bigint, date, date, bigint[], text, text, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.projects_save_planning_occurrence(
  bigint, bigint, date, date, bigint[], text, text, numeric, text, text
) to authenticated;

-- The old Planning shortcuts could create a project as Armement and returned
-- the full planning_projects row, including charter hire. They are superseded
-- by the Project assistant and the secured operation RPC above.
revoke execute on function public.planning_schedule_catalog_project(
  bigint, date, date, bigint, text, text
) from authenticated;
revoke execute on function public.planning_create_and_schedule_project(
  text, bigint, bigint, date, text, text
) from authenticated;

create table if not exists public.planning_operation_project_reconciliation (
  id bigint generated by default as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  planning_occurrence_id bigint not null
    references public.planning_projects(id) on delete cascade,
  title_snapshot text not null,
  extracted_project_code text,
  matched_project_id bigint references public.projects(id) on delete set null,
  resolution_status text not null check (
    resolution_status in ('linked_exact', 'code_not_found', 'ambiguous', 'no_code')
  ),
  candidate_count integer not null default 0,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (planning_occurrence_id)
);

alter table public.planning_operation_project_reconciliation enable row level security;
drop policy if exists planning_operation_reconciliation_manager_read
  on public.planning_operation_project_reconciliation;
create policy planning_operation_reconciliation_manager_read
  on public.planning_operation_project_reconciliation
  for select
  to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
  );

revoke all on table public.planning_operation_project_reconciliation
  from public, anon, authenticated;
grant select on table public.planning_operation_project_reconciliation
  to authenticated;
grant all on table public.planning_operation_project_reconciliation
  to service_role;

with extracted as (
  select
    occurrence.id as planning_occurrence_id,
    occurrence.company_id,
    occurrence.title,
    upper((regexp_match(
      coalesce(occurrence.title, '') || ' ' || coalesce(occurrence.description, ''),
      '(^|[^A-Z0-9])(P[0-9]{1,8})([^A-Z0-9]|$)',
      'i'
    ))[2]) as exact_code
  from public.planning_projects occurrence
  where occurrence.catalog_project_id is null
), candidates as (
  select
    extracted.*,
    count(project.id)::integer as candidate_count,
    min(project.id) as matched_project_id
  from extracted
  left join public.projects project
    on project.company_id = extracted.company_id
   and upper(btrim(project.project_code)) = extracted.exact_code
   and project.archived_at is null
  group by
    extracted.planning_occurrence_id,
    extracted.company_id,
    extracted.title,
    extracted.exact_code
)
insert into public.planning_operation_project_reconciliation (
  company_id,
  planning_occurrence_id,
  title_snapshot,
  extracted_project_code,
  matched_project_id,
  resolution_status,
  candidate_count,
  resolved_at
)
select
  candidate.company_id,
  candidate.planning_occurrence_id,
  candidate.title,
  candidate.exact_code,
  case when candidate.candidate_count = 1 then candidate.matched_project_id end,
  case
    when candidate.exact_code is null then 'no_code'
    when candidate.candidate_count = 1 then 'linked_exact'
    when candidate.candidate_count > 1 then 'ambiguous'
    else 'code_not_found'
  end,
  candidate.candidate_count,
  case when candidate.candidate_count = 1 then now() end
from candidates candidate
on conflict (planning_occurrence_id) do nothing;

update public.planning_projects occurrence
set
  catalog_project_id = reconciliation.matched_project_id,
  updated_at = now()
from public.planning_operation_project_reconciliation reconciliation
where reconciliation.planning_occurrence_id = occurrence.id
  and reconciliation.resolution_status = 'linked_exact'
  and reconciliation.matched_project_id is not null
  and occurrence.catalog_project_id is null;

comment on table public.planning_operation_vessels is
  'Ordered, unlimited vessel assignments for one Planning operation. The first two vessels remain mirrored in legacy planning_projects columns.';
comment on table public.planning_operation_project_reconciliation is
  'Auditable exact-code reconciliation of historical Planning operations to commercial projects/contracts.';
comment on function public.projects_save_planning_occurrence(
  bigint, bigint, date, date, bigint[], text, text, numeric, text, text
) is
  'Creates or edits one contract-linked Planning operation with unlimited vessels. Only Admin and Direction may read or write charter-hire fields.';
