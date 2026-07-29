-- Project operations: contract-hire snapshots, editable occurrences and SharePoint attachments.

alter table public.planning_projects
  add column if not exists charter_hire numeric,
  add column if not exists hire_currency text,
  add column if not exists hire_unit text;

comment on column public.planning_projects.charter_hire is
  'Operation-level charter hire snapshot. It is copied from the contract when the occurrence is created and is never updated retroactively.';
comment on column public.planning_projects.hire_currency is
  'Currency copied with the operation charter hire snapshot.';
comment on column public.planning_projects.hire_unit is
  'Billing unit copied with the operation charter hire snapshot.';

create or replace function public.planning_project_copy_contract_hire()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  contract_snapshot public.project_contracts%rowtype;
begin
  if new.catalog_project_id is null
     or (
       new.charter_hire is not null
       and nullif(btrim(new.hire_currency), '') is not null
       and nullif(btrim(new.hire_unit), '') is not null
     ) then
    return new;
  end if;

  select contract.*
  into contract_snapshot
  from public.project_contracts contract
  where contract.company_id = new.company_id
    and contract.project_id = new.catalog_project_id
    and contract.archived_at is null
  order by contract.id desc
  limit 1;

  new.charter_hire := coalesce(new.charter_hire, contract_snapshot.charter_hire);
  new.hire_currency := coalesce(nullif(upper(btrim(new.hire_currency)), ''), contract_snapshot.hire_currency);
  new.hire_unit := coalesce(nullif(btrim(new.hire_unit), ''), contract_snapshot.hire_unit);
  return new;
end;
$$;

drop trigger if exists planning_projects_copy_contract_hire on public.planning_projects;
create trigger planning_projects_copy_contract_hire
before insert on public.planning_projects
for each row
execute function public.planning_project_copy_contract_hire();

revoke all on function public.planning_project_copy_contract_hire() from public, anon, authenticated;

update public.planning_projects occurrence
set
  charter_hire = coalesce(
    occurrence.charter_hire,
    (
      select contract.charter_hire
      from public.project_contracts contract
      where contract.company_id = occurrence.company_id
        and contract.project_id = occurrence.catalog_project_id
        and contract.archived_at is null
      order by contract.id desc
      limit 1
    )
  ),
  hire_currency = coalesce(
    nullif(btrim(occurrence.hire_currency), ''),
    (
      select contract.hire_currency
      from public.project_contracts contract
      where contract.company_id = occurrence.company_id
        and contract.project_id = occurrence.catalog_project_id
        and contract.archived_at is null
      order by contract.id desc
      limit 1
    )
  ),
  hire_unit = coalesce(
    nullif(btrim(occurrence.hire_unit), ''),
    (
      select contract.hire_unit
      from public.project_contracts contract
      where contract.company_id = occurrence.company_id
        and contract.project_id = occurrence.catalog_project_id
        and contract.archived_at is null
      order by contract.id desc
      limit 1
    )
  )
where occurrence.catalog_project_id is not null
  and (
    occurrence.charter_hire is null
    or nullif(btrim(occurrence.hire_currency), '') is null
    or nullif(btrim(occurrence.hire_unit), '') is null
  );

alter table public.project_generated_documents
  drop constraint if exists project_generated_documents_type_check;

alter table public.project_generated_documents
  add constraint project_generated_documents_type_check check (
    document_type in (
      'offer',
      'bimco_supplytime',
      'towage_contract',
      'bareboat_charter',
      'intellectual_service',
      'operation_attachment'
    )
  );

comment on column public.project_generated_documents.planning_occurrence_id is
  'Optional precise Planning operation link. Required for operation_attachment documents.';

create or replace function public.projects_save_planning_occurrence(
  target_occurrence_id bigint,
  target_project_id bigint,
  target_starts_on date,
  target_ends_on date,
  target_primary_vessel_id bigint,
  target_status text,
  target_description text,
  target_charter_hire numeric,
  target_hire_currency text,
  target_hire_unit text
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
  contract_snapshot public.project_contracts%rowtype;
  saved_occurrence_id bigint;
  effective_hire numeric;
  effective_currency text;
  effective_unit text;
begin
  if target_company_id is null
     or not public.user_belongs_to_company(target_company_id)
     or not public.has_any_role(array['admin', 'direction']) then
    raise exception 'Insufficient permission to save a project operation' using errcode = '42501';
  end if;

  if target_starts_on is null or target_ends_on is null or target_ends_on < target_starts_on then
    raise exception 'A valid operation date range is required' using errcode = '22023';
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

  select contract.*
  into contract_snapshot
  from public.project_contracts contract
  where contract.company_id = target_company_id
    and contract.project_id = catalog_project.id
    and contract.archived_at is null
  order by contract.id desc
  limit 1;

  effective_hire := coalesce(
    target_charter_hire,
    case when target_occurrence_id is null then contract_snapshot.charter_hire else null end
  );
  effective_currency := coalesce(
    nullif(upper(btrim(target_hire_currency)), ''),
    case when target_occurrence_id is null then nullif(upper(btrim(contract_snapshot.hire_currency)), '') else null end
  );
  effective_unit := coalesce(
    nullif(btrim(target_hire_unit), ''),
    case when target_occurrence_id is null then nullif(btrim(contract_snapshot.hire_unit), '') else null end
  );

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
      target_vessel.id,
      target_vessel.name,
      catalog_project.secondary_vessel_id,
      catalog_project.secondary_vessel_name,
      'operation',
      coalesce(nullif(btrim(target_status), ''), 'A planifier'),
      effective_hire,
      effective_currency,
      effective_unit,
      'seapilot-projects',
      now(),
      now()
    )
    returning id into saved_occurrence_id;
  else
    update public.planning_projects occurrence
    set
      starts_on = target_starts_on,
      ends_on = target_ends_on,
      description = nullif(btrim(target_description), ''),
      primary_vessel_id = target_vessel.id,
      primary_vessel_name = target_vessel.name,
      status = coalesce(nullif(btrim(target_status), ''), occurrence.status),
      charter_hire = coalesce(effective_hire, occurrence.charter_hire),
      hire_currency = coalesce(effective_currency, occurrence.hire_currency),
      hire_unit = coalesce(effective_unit, occurrence.hire_unit),
      updated_at = now()
    where occurrence.id = target_occurrence_id
      and occurrence.company_id = target_company_id
      and occurrence.catalog_project_id = catalog_project.id
    returning occurrence.id into saved_occurrence_id;

    if saved_occurrence_id is null then
      raise exception 'Project operation not found' using errcode = 'P0002';
    end if;
  end if;

  return query
  select occurrence.*
  from public.planning_projects occurrence
  where occurrence.id = saved_occurrence_id
    and occurrence.company_id = target_company_id;
end;
$$;

revoke all on function public.projects_save_planning_occurrence(
  bigint, bigint, date, date, bigint, text, text, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.projects_save_planning_occurrence(
  bigint, bigint, date, date, bigint, text, text, numeric, text, text
) to authenticated;

comment on function public.projects_save_planning_occurrence(
  bigint, bigint, date, date, bigint, text, text, numeric, text, text
) is
  'Creates or edits one project operation. New operations receive an independent charter-hire snapshot from the active project contract.';
