-- Resolve project labels only through DPRs the caller can read. The projects
-- table stays restricted to commercial roles; no financial fields are exposed.
create or replace function public.dpr_report_projects()
returns table (id bigint, project_code text, title text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
begin
  if (select auth.uid()) is null
    or target_company_id is null
    or not public.user_belongs_to_company(target_company_id)
    or not public.dpr_user_has_module_access(target_company_id) then
    raise exception 'DPR module access required' using errcode = '42501';
  end if;
  return query
  select project.id, project.project_code, project.title
  from public.projects project
  where project.company_id = target_company_id
    and exists (
      select 1 from public.dpr_reports report
      where report.project_id = project.id
        and report.company_id = target_company_id
        and report.deleted_at is null
        and public.dpr_can_read_report(report.id)
    )
  order by project.project_code, project.id;
end;
$$;
revoke all on function public.dpr_report_projects() from public, anon, authenticated;
grant execute on function public.dpr_report_projects() to authenticated;

-- Only vessel reference data is widened. Do not widen planning_user_can(read),
-- which is reused by live draft, RH, document and other module policies.
create policy vessels_field_planning_fleet_read
on public.vessels for select to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (select public.user_belongs_to_company(company_id))
  and (select public.has_any_role(array['capitaine', 'marin']))
);

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
  if (select auth.uid()) is null
    or not public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin'])
    or target_company_id is null
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

  select coalesce(array_agg(distinct (item ->> 'vessel_id')::bigint), '{}'::bigint[])
  into allowed_vessel_ids
  from jsonb_array_elements(coalesce(target_snapshot -> 'assignments', '[]'::jsonb)) item
  where (item ->> 'crew_person_id')::bigint = target_person_id
     or (captain_role and nullif(item ->> 'captain_person_id', '')::bigint = target_person_id);

  -- Every vessel in the latest published company snapshot is visible. Live
  -- draft access and all operational write permissions remain unchanged.
  visible_assignments := coalesce(target_snapshot -> 'assignments', '[]'::jsonb);
  visible_days := coalesce(target_snapshot -> 'days', '[]'::jsonb);
  visible_periods := coalesce(target_snapshot -> 'periods', '[]'::jsonb);
  visible_handovers := coalesce(target_snapshot -> 'handovers', '[]'::jsonb);
  select coalesce(jsonb_agg(public.planning_redact_financial_fields(item)), '[]'::jsonb)
  into visible_projects
  from jsonb_array_elements(coalesce(target_snapshot -> 'projects', '[]'::jsonb)) item;

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
