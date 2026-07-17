-- Planning: document expiries are advisory markers only; derogations are retired.

update public.planning_rules
set
  active = false,
  control_level = 'information',
  description = 'Échéance documentaire signalée visuellement dans la grille Planning, sans blocage.',
  source_reference = 'Règle interne BBTM — signalement visuel uniquement',
  updated_at = now()
where code in ('expired_medical', 'expired_credential', 'credential_expires_during_assignment');

drop policy if exists planning_derogations_action_write on public.planning_derogations;
drop policy if exists planning_derogations_admin_write on public.planning_derogations;
revoke insert, update, delete on table public.planning_derogations from authenticated;
revoke usage, select on sequence public.planning_derogations_id_seq from authenticated;

comment on table public.planning_derogations is
  'Historical Planning exceptions retained read-only for audit; new derogations are retired.';

create or replace function public.enforce_planning_assignment_blockers()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  person_row public.people%rowtype;
  period_status text;
  medical_unfit_block boolean;
  target_day date := (new.starts_at at time zone 'Europe/Paris')::date;
begin
  if new.confirmation_status = 'cancelled' then
    return new;
  end if;

  select * into person_row from public.people where id = new.crew_person_id;
  if (
    not person_row.active
    or (person_row.hired_on is not null and person_row.hired_on > new.ends_on)
    or (person_row.departed_on is not null and person_row.departed_on < new.starts_on)
  ) and public.planning_rule_is_blocking('inactive_person', target_day) then
    raise exception using errcode = 'P0001', message = 'PLANNING_CONTROL_BLOCKED: inactive_person';
  end if;

  select lower(coalesce(period.sailor_status, '')) into period_status
  from public.planning_periods period
  where period.person_id = new.crew_person_id
    and period.starts_on <= new.ends_on
    and period.ends_on >= new.starts_on
    and lower(coalesce(period.sailor_status, '')) ~ '(cong|absen|malad|arr.t|repos|formation|indispon)'
  order by period.starts_on
  limit 1;

  if period_status ~ '(cong|absen|malad|arr.t)'
    and public.planning_rule_is_blocking('crew_absence', target_day) then
    raise exception using errcode = 'P0001', message = 'PLANNING_CONTROL_BLOCKED: crew_absence';
  elsif period_status is not null
    and public.planning_rule_is_blocking('crew_unavailability', target_day) then
    raise exception using errcode = 'P0001', message = 'PLANNING_CONTROL_BLOCKED: crew_unavailability';
  end if;

  select exists (
    select 1
    from public.hr_documents document
    where document.person_id = new.crew_person_id
      and document.medical_unfit is true
  ) into medical_unfit_block;

  if medical_unfit_block
    and public.planning_rule_is_blocking('medical_unfit', target_day) then
    raise exception using errcode = 'P0001', message = 'PLANNING_CONTROL_BLOCKED: medical_unfit';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_planning_assignment_blockers() from public, anon, authenticated;

create or replace function public.enforce_planning_p12_absence_blockers()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  conflicting_absence public.planning_absences%rowtype;
  target_rule_code text;
  target_day date := (new.starts_at at time zone 'Europe/Paris')::date;
begin
  if new.confirmation_status = 'cancelled' then return new; end if;

  select absence.* into conflicting_absence
  from public.planning_absences absence
  where absence.company_id = new.company_id
    and absence.person_id = new.crew_person_id
    and absence.status = 'approved'
    and absence.starts_at < new.ends_at
    and absence.ends_at > new.starts_at
  order by absence.starts_at
  limit 1;

  if conflicting_absence.id is null then return new; end if;
  target_rule_code := case when conflicting_absence.absence_type = 'unavailability'
    then 'crew_unavailability' else 'crew_absence' end;

  if public.planning_rule_is_blocking(target_rule_code, target_day) then
    raise exception using errcode = 'P0001', message = 'PLANNING_CONTROL_BLOCKED: ' || target_rule_code;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_planning_p12_absence_blockers() from public, anon, authenticated;

create or replace function public.update_planning_conflict_case(
  p_case_id bigint,
  p_assign_to_me boolean,
  p_priority text,
  p_status text,
  p_comment text,
  p_derogation_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_case public.planning_conflict_cases%rowtype;
  actor_name text := public.planning_current_actor_name();
begin
  select * into target_case from public.planning_conflict_cases where id = p_case_id for update;
  if target_case.id is null then
    raise exception using errcode = 'P0002', message = 'PLANNING_CONFLICT_NOT_FOUND';
  end if;
  if not public.planning_user_can(
    'manage_conflict', target_case.company_id, target_case.vessel_id,
    target_case.starts_on, target_case.ends_on
  ) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: traitement du conflit.';
  end if;
  if p_derogation_id is not null or p_status = 'derogated' then
    raise exception using errcode = '22023', message = 'PLANNING_DEROGATION_RETIRED';
  end if;
  if p_priority not in ('low', 'normal', 'high', 'critical')
    or p_status not in ('open', 'in_progress', 'resolved', 'dismissed') then
    raise exception using errcode = '22023', message = 'PLANNING_CONFLICT_TREATMENT_INVALID';
  end if;
  if p_status in ('resolved', 'dismissed') and length(trim(coalesce(p_comment, ''))) < 3 then
    raise exception using errcode = '22023', message = 'PLANNING_CONFLICT_COMMENT_REQUIRED';
  end if;

  update public.planning_conflict_cases set
    owner_id = case when p_assign_to_me then (select auth.uid()) else owner_id end,
    owner_name = case when p_assign_to_me then actor_name else owner_name end,
    priority = p_priority,
    status = p_status,
    last_comment = nullif(trim(coalesce(p_comment, '')), ''),
    derogation_id = null,
    resolved_at = case when p_status in ('resolved', 'dismissed') then now() else null end,
    last_seen_at = now(),
    updated_by = (select auth.uid()),
    updated_at = now()
  where id = p_case_id;
  return p_case_id;
end;
$$;

revoke all on function public.update_planning_conflict_case(bigint, boolean, text, text, text, bigint) from public, anon;
grant execute on function public.update_planning_conflict_case(bigint, boolean, text, text, text, bigint) to authenticated;

comment on function public.update_planning_conflict_case(bigint, boolean, text, text, text, bigint) is
  'Updates manual conflict treatment; derogation status and links are retired.';

drop function if exists public.planning_has_active_derogation(text, bigint, bigint, timestamptz, timestamptz);
