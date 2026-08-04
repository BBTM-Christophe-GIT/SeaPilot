-- Working-time administrator settings: keep the shared P1.3 policy model while
-- enforcing the administrator-only business rule at the RPC boundary.

create or replace function public.save_planning_work_rest_policy(
  p_policy_id bigint,
  p_name text,
  p_scope text,
  p_vessel_id bigint,
  p_effective_from date,
  p_effective_to date,
  p_max_work_24h numeric,
  p_min_rest_24h numeric,
  p_max_work_7d numeric,
  p_min_rest_7d numeric,
  p_min_consecutive_rest_hours numeric,
  p_max_rest_periods_24h integer,
  p_night_starts_at time,
  p_night_ends_at time,
  p_max_night_work_24h numeric,
  p_include_handover boolean,
  p_active boolean,
  p_notes text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_id bigint;
begin
  if target_company_id is null
     or not public.has_company_role(target_company_id, array['admin']) then
    raise exception using errcode = '42501', message = 'Seul un administrateur peut gérer les politiques de travail et repos.';
  end if;

  if p_scope not in ('company', 'vessel')
     or (p_scope = 'company' and p_vessel_id is not null)
     or (p_scope = 'vessel' and p_vessel_id is null) then
    raise exception using errcode = '22023', message = 'La portée de la politique est invalide.';
  end if;

  if p_scope = 'vessel' and not exists (
    select 1
    from public.vessels
    where id = p_vessel_id and company_id = target_company_id
  ) then
    raise exception using errcode = '23503', message = 'Le navire ne fait pas partie de l’entreprise active.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      target_company_id::text || ':work-rest:' || p_scope || ':' || coalesce(p_vessel_id::text, 'company'),
      0
    )
  );

  if p_active and exists (
    select 1
    from public.planning_work_rest_policies policy
    where policy.company_id = target_company_id
      and policy.active
      and policy.scope = p_scope
      and policy.vessel_id is not distinct from p_vessel_id
      and policy.id is distinct from p_policy_id
      and daterange(policy.effective_from, coalesce(policy.effective_to, 'infinity'::date), '[]')
          && daterange(p_effective_from, coalesce(p_effective_to, 'infinity'::date), '[]')
  ) then
    raise exception using errcode = '23P01', message = 'Une politique active couvre déjà cette portée et cette période.';
  end if;

  if p_policy_id is null then
    insert into public.planning_work_rest_policies (
      company_id, name, scope, vessel_id, effective_from, effective_to,
      max_work_24h, min_rest_24h, max_work_7d, min_rest_7d,
      min_consecutive_rest_hours, max_rest_periods_24h,
      night_starts_at, night_ends_at, max_night_work_24h,
      include_handover, active, notes
    ) values (
      target_company_id, trim(p_name), p_scope, p_vessel_id,
      p_effective_from, p_effective_to,
      p_max_work_24h, p_min_rest_24h, p_max_work_7d, p_min_rest_7d,
      p_min_consecutive_rest_hours, p_max_rest_periods_24h,
      p_night_starts_at, p_night_ends_at, p_max_night_work_24h,
      p_include_handover, p_active, nullif(trim(coalesce(p_notes, '')), '')
    ) returning id into target_id;
  else
    update public.planning_work_rest_policies
    set name = trim(p_name),
        scope = p_scope,
        vessel_id = p_vessel_id,
        effective_from = p_effective_from,
        effective_to = p_effective_to,
        max_work_24h = p_max_work_24h,
        min_rest_24h = p_min_rest_24h,
        max_work_7d = p_max_work_7d,
        min_rest_7d = p_min_rest_7d,
        min_consecutive_rest_hours = p_min_consecutive_rest_hours,
        max_rest_periods_24h = p_max_rest_periods_24h,
        night_starts_at = p_night_starts_at,
        night_ends_at = p_night_ends_at,
        max_night_work_24h = p_max_night_work_24h,
        include_handover = p_include_handover,
        active = p_active,
        notes = nullif(trim(coalesce(p_notes, '')), ''),
        updated_at = now(),
        updated_by = auth.uid()
    where id = p_policy_id and company_id = target_company_id
    returning id into target_id;

    if target_id is null then
      raise exception using errcode = 'P0002', message = 'Politique introuvable.';
    end if;
  end if;

  insert into public.planning_change_log (
    company_id, entity_kind, entity_id, action, payload,
    changed_by, changed_by_name, vessel_id, starts_on, ends_on, summary
  ) values (
    target_company_id,
    'work_rest_policy',
    target_id,
    case when p_policy_id is null then 'create' else 'update' end,
    jsonb_build_object('name', trim(p_name), 'scope', p_scope, 'active', p_active),
    auth.uid(),
    public.planning_current_actor_name(),
    p_vessel_id,
    p_effective_from,
    coalesce(p_effective_to, p_effective_from),
    'Politique de travail et repos enregistrée'
  );

  return target_id;
end;
$$;

revoke all on function public.save_planning_work_rest_policy(
  bigint, text, text, bigint, date, date, numeric, numeric, numeric, numeric,
  numeric, integer, time, time, numeric, boolean, boolean, text
) from public, anon, authenticated;
grant execute on function public.save_planning_work_rest_policy(
  bigint, text, text, bigint, date, date, numeric, numeric, numeric, numeric,
  numeric, integer, time, time, numeric, boolean, boolean, text
) to authenticated;

comment on function public.save_planning_work_rest_policy(
  bigint, text, text, bigint, date, date, numeric, numeric, numeric, numeric,
  numeric, integer, time, time, numeric, boolean, boolean, text
) is 'Admin-only write boundary for dated company or vessel work/rest policies; no legal thresholds are inferred.';

comment on column public.planning_work_rest_policies.max_work_24h
  is 'Administrator-configured maximum work on any rolling 24-hour window.';
comment on column public.planning_work_rest_policies.min_rest_24h
  is 'Administrator-configured minimum rest on any rolling 24-hour window.';
comment on column public.planning_work_rest_policies.max_work_7d
  is 'Administrator-configured maximum work on any rolling 7-day window.';
comment on column public.planning_work_rest_policies.min_rest_7d
  is 'Administrator-configured minimum rest on any rolling 7-day window.';
comment on column public.planning_work_rest_policies.notes
  is 'Administrative context only. Workbook values are import suggestions to verify, never implicit legal truth.';
