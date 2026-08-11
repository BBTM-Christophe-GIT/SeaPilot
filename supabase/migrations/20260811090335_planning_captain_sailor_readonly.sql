-- Capitaine and Marin get a strictly read-only operational Planning surface.
-- Leave requests remain the only Planning write available to terrain roles.

delete from public.planning_action_permissions
where role_key in ('capitaine', 'marin')
  and action_key not in ('read', 'read_notifications', 'request_absence');

create or replace function public.planning_user_can(
  target_action text,
  target_company_id bigint,
  target_vessel_id bigint default null,
  target_starts_on date default null,
  target_ends_on date default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.user_belongs_to_company(target_company_id)
    and (
      not public.has_any_role(array['capitaine', 'marin'])
      or public.has_any_role(array['admin', 'direction', 'armement'])
      or target_action in ('read', 'read_notifications', 'request_absence')
    )
    and (
      exists (
        select 1
        from public.user_roles user_role
        join public.planning_action_permissions permission on permission.role_key = user_role.role_key
        where user_role.user_id = (select auth.uid())
          and user_role.company_id = target_company_id
          and permission.action_key = target_action
          and (
            permission.scope_mode = 'company'
            or (
              permission.scope_mode = 'assigned_vessel'
              and target_vessel_id is not null
              and exists (
                select 1
                from public.planning_assignments assignment
                where assignment.company_id = target_company_id
                  and assignment.vessel_id = target_vessel_id
                  and assignment.captain_person_id = public.current_person_id()
                  and assignment.confirmation_status <> 'cancelled'
                  and (target_starts_on is null or assignment.ends_on >= target_starts_on)
                  and (target_ends_on is null or assignment.starts_on <= target_ends_on)
              )
            )
          )
      )
      or (
        target_vessel_id is not null
        and exists (
          select 1
          from public.planning_vessel_permissions vessel_permission
          where vessel_permission.company_id = target_company_id
            and vessel_permission.user_id = (select auth.uid())
            and vessel_permission.vessel_id = target_vessel_id
            and vessel_permission.action_key = target_action
            and vessel_permission.revoked_at is null
            and (vessel_permission.starts_on is null or target_ends_on is null or vessel_permission.starts_on <= target_ends_on)
            and (vessel_permission.ends_on is null or target_starts_on is null or vessel_permission.ends_on >= target_starts_on)
        )
      )
    );
$$;

create or replace function public.planning_redact_financial_fields(target_item jsonb)
returns jsonb
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(target_item, '{}'::jsonb) - array[
    'charter_hire',
    'charter_hire_override',
    'hire_currency',
    'hire_unit',
    'mobilisation_fee',
    'demobilisation_fee',
    'fee_currency',
    'extension_hire',
    'standby_hire',
    'weather_standby_hire',
    'amount',
    'amount_ht',
    'amount_ttc',
    'unit_amount_ht',
    'unit_price',
    'unit_price_ht',
    'price',
    'cost',
    'currency'
  ]::text[];
$$;

revoke execute on function public.planning_redact_financial_fields(jsonb)
  from public, anon, authenticated;

create or replace function public.planning_visible_release_snapshot(target_snapshot jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := nullif(target_snapshot #>> '{scope,company_id}', '')::bigint;
  target_person_id bigint := public.current_person_id();
  office_role boolean := public.has_any_role(array['admin', 'direction', 'armement']);
  financial_role boolean := public.has_any_role(array['admin', 'direction']);
  captain_role boolean := public.has_role('capitaine');
  allowed_vessel_ids bigint[] := '{}'::bigint[];
  visible_assignments jsonb := '[]'::jsonb;
  visible_days jsonb := '[]'::jsonb;
  visible_periods jsonb := '[]'::jsonb;
  visible_projects jsonb := '[]'::jsonb;
  visible_handovers jsonb := '[]'::jsonb;
  visible_derogations jsonb := '[]'::jsonb;
begin
  if target_company_id is null
    or target_company_id is distinct from public.current_planning_company_id()
    or not public.user_belongs_to_company(target_company_id) then
    raise exception using
      errcode = '42501',
      message = 'PLANNING_PERMISSION_DENIED: diffusion du planning.';
  end if;

  if office_role then
    if financial_role then
      return target_snapshot;
    end if;

    select coalesce(jsonb_agg(public.planning_redact_financial_fields(item)), '[]'::jsonb)
    into visible_projects
    from jsonb_array_elements(coalesce(target_snapshot -> 'projects', '[]'::jsonb)) item;

    return target_snapshot || jsonb_build_object('projects', visible_projects);
  end if;

  if target_person_id is null then
    return target_snapshot || jsonb_build_object(
      'assignments', '[]'::jsonb,
      'days', '[]'::jsonb,
      'periods', '[]'::jsonb,
      'projects', '[]'::jsonb,
      'handovers', '[]'::jsonb,
      'derogations', '[]'::jsonb
    );
  end if;

  select coalesce(array_agg(distinct (item ->> 'vessel_id')::bigint), '{}'::bigint[])
  into allowed_vessel_ids
  from jsonb_array_elements(coalesce(target_snapshot -> 'assignments', '[]'::jsonb)) item
  where (item ->> 'crew_person_id')::bigint = target_person_id
     or (captain_role and nullif(item ->> 'captain_person_id', '')::bigint = target_person_id);

  -- A complete assigned-vessel crew is required to generate a valid crew list.
  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into visible_assignments
  from jsonb_array_elements(coalesce(target_snapshot -> 'assignments', '[]'::jsonb)) item
  where nullif(item ->> 'vessel_id', '')::bigint = any(allowed_vessel_ids);

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into visible_days
  from jsonb_array_elements(coalesce(target_snapshot -> 'days', '[]'::jsonb)) item
  where case
    when captain_role then nullif(item ->> 'vessel_id', '')::bigint = any(allowed_vessel_ids)
    else nullif(item ->> 'person_id', '')::bigint = target_person_id
  end;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into visible_periods
  from jsonb_array_elements(coalesce(target_snapshot -> 'periods', '[]'::jsonb)) item
  where case
    when captain_role then nullif(item ->> 'vessel_id', '')::bigint = any(allowed_vessel_ids)
    else nullif(item ->> 'person_id', '')::bigint = target_person_id
  end;

  select coalesce(jsonb_agg(public.planning_redact_financial_fields(item)), '[]'::jsonb)
  into visible_projects
  from jsonb_array_elements(coalesce(target_snapshot -> 'projects', '[]'::jsonb)) item
  where nullif(item ->> 'primary_vessel_id', '')::bigint = any(allowed_vessel_ids)
     or nullif(item ->> 'secondary_vessel_id', '')::bigint = any(allowed_vessel_ids);

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into visible_handovers
  from jsonb_array_elements(coalesce(target_snapshot -> 'handovers', '[]'::jsonb)) item
  where nullif(item ->> 'vessel_id', '')::bigint = any(allowed_vessel_ids);

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into visible_derogations
  from jsonb_array_elements(coalesce(target_snapshot -> 'derogations', '[]'::jsonb)) item
  where nullif(item ->> 'person_id', '')::bigint = target_person_id
     or (captain_role and nullif(item ->> 'vessel_id', '')::bigint = any(allowed_vessel_ids));

  return target_snapshot || jsonb_build_object(
    'assignments', visible_assignments,
    'days', visible_days,
    'periods', visible_periods,
    'projects', visible_projects,
    'handovers', visible_handovers,
    'derogations', visible_derogations
  );
end;
$$;

revoke execute on function public.planning_visible_release_snapshot(jsonb)
  from public, anon, authenticated;

drop policy if exists project_generated_documents_company_read
  on public.project_generated_documents;
create policy project_generated_documents_company_read
  on public.project_generated_documents
  for select to authenticated
  using (
    public.user_belongs_to_company(company_id)
    and (
      not public.has_any_role(array['capitaine', 'marin'])
      or public.has_any_role(array['admin', 'direction', 'armement'])
      or (
        document_type = 'operation_attachment'
        and planning_occurrence_id is not null
        and exists (
          select 1
          from public.planning_projects occurrence
          where occurrence.id = planning_occurrence_id
            and occurrence.company_id = project_generated_documents.company_id
            and (
              public.planning_can_read_row(
                occurrence.company_id,
                occurrence.primary_vessel_id,
                null,
                coalesce(occurrence.starts_on, current_date),
                coalesce(occurrence.ends_on, occurrence.starts_on, current_date)
              )
              or (
                occurrence.secondary_vessel_id is not null
                and public.planning_can_read_row(
                  occurrence.company_id,
                  occurrence.secondary_vessel_id,
                  null,
                  coalesce(occurrence.starts_on, current_date),
                  coalesce(occurrence.ends_on, occurrence.starts_on, current_date)
                )
              )
            )
        )
      )
    )
  );

create or replace function public.projects_contracts()
returns table (
  id bigint,
  project_id bigint,
  owner_identity text,
  vessel_assignment_limit text,
  extension_count integer,
  extension_duration numeric,
  extension_unit text,
  auto_extension_period text,
  max_extension_days integer,
  mobilisation_fee numeric,
  demobilisation_fee numeric,
  fee_currency text,
  charter_hire numeric,
  extension_hire numeric,
  hire_currency text,
  hire_unit text,
  max_audit_period text,
  supplytime_schema_version text,
  supplytime_data jsonb,
  towed_asset_id bigint,
  source_label text,
  sharepoint_list_title text,
  sharepoint_item_id text,
  source_modified_at timestamptz,
  archived_at timestamptz
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
    raise exception 'Insufficient permission to read project contracts' using errcode = '42501';
  end if;

  return query
  select
    contract.id,
    contract.project_id,
    contract.owner_identity,
    contract.vessel_assignment_limit,
    contract.extension_count,
    contract.extension_duration,
    contract.extension_unit,
    contract.auto_extension_period,
    contract.max_extension_days,
    contract.mobilisation_fee,
    contract.demobilisation_fee,
    contract.fee_currency,
    contract.charter_hire,
    contract.extension_hire,
    contract.hire_currency,
    contract.hire_unit,
    contract.max_audit_period,
    contract.supplytime_schema_version,
    contract.supplytime_data,
    contract.towed_asset_id,
    contract.source_label,
    contract.sharepoint_list_title,
    contract.sharepoint_item_id,
    contract.source_modified_at,
    contract.archived_at
  from public.project_contracts contract
  where contract.company_id = target_company_id
  order by contract.id;
end;
$$;

revoke all on function public.projects_contracts()
  from public, anon, authenticated;
grant execute on function public.projects_contracts()
  to authenticated;
