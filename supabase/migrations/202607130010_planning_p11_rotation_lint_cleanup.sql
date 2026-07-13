-- P1.1 post-deployment cleanup: remove the redundant PL/pgSQL declaration
-- shadowed by the integer FOR loop. This changes no data or business behavior.
-- Rollback: recreate the function from 202607130009; the warning may return.

create or replace function public.save_planning_rotation_series(
  p_vessel_id bigint,
  p_crew_person_id bigint,
  p_captain_person_id bigint,
  p_name text,
  p_pattern_key text,
  p_starts_on date,
  p_onboard_days integer,
  p_rest_days integer,
  p_occurrence_count integer,
  p_assignment_role text,
  p_watch_group text,
  p_handover_minutes integer,
  p_confirmation_status text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint;
  target_series_id bigint;
  target_assignment_id bigint;
  occurrence_start date;
  occurrence_end date;
begin
  select company_id into target_company_id from public.vessels where id = p_vessel_id;
  if target_company_id is null
    or not exists (select 1 from public.people where id = p_crew_person_id and company_id = target_company_id)
    or (p_captain_person_id is not null and not exists (select 1 from public.people where id = p_captain_person_id and company_id = target_company_id)) then
    raise exception using errcode = '23514', message = 'PLANNING_REFERENCE_INVALID: navire ou marin.';
  end if;
  if not public.planning_user_can('manage_rotation', target_company_id, p_vessel_id, p_starts_on,
    p_starts_on + ((p_onboard_days + p_rest_days) * p_occurrence_count)) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: rotation.';
  end if;
  if p_pattern_key not in ('7_7', '10_10', '14_14', 'custom')
    or p_onboard_days not between 1 and 90 or p_rest_days not between 1 and 90
    or p_occurrence_count not between 1 and 104
    or p_handover_minutes not between 0 and 1440
    or p_confirmation_status not in ('provisional', 'confirmed')
    or length(trim(coalesce(p_name, ''))) < 2 or length(trim(coalesce(p_assignment_role, ''))) = 0 then
    raise exception using errcode = '22023', message = 'PLANNING_ROTATION_INVALID: champs obligatoires ou rythme invalide.';
  end if;
  if (p_pattern_key = '7_7' and (p_onboard_days <> 7 or p_rest_days <> 7))
    or (p_pattern_key = '10_10' and (p_onboard_days <> 10 or p_rest_days <> 10))
    or (p_pattern_key = '14_14' and (p_onboard_days <> 14 or p_rest_days <> 14)) then
    raise exception using errcode = '22023', message = 'PLANNING_ROTATION_PATTERN_MISMATCH';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':rotation:' || p_crew_person_id::text, 0));

  insert into public.planning_rotation_series (
    company_id, vessel_id, crew_person_id, captain_person_id, name, pattern_key, starts_on,
    onboard_days, rest_days, occurrence_count, assignment_role, watch_group,
    handover_minutes, confirmation_status
  ) values (
    target_company_id, p_vessel_id, p_crew_person_id, p_captain_person_id, trim(p_name), p_pattern_key,
    p_starts_on, p_onboard_days, p_rest_days, p_occurrence_count, trim(p_assignment_role),
    nullif(trim(coalesce(p_watch_group, '')), ''), p_handover_minutes, p_confirmation_status
  ) returning id into target_series_id;

  for occurrence_number in 1..p_occurrence_count loop
    occurrence_start := p_starts_on + ((occurrence_number - 1) * (p_onboard_days + p_rest_days));
    occurrence_end := occurrence_start + (p_onboard_days - 1);
    if exists (
      select 1 from public.planning_assignments assignment
      where assignment.company_id = target_company_id
        and assignment.crew_person_id = p_crew_person_id
        and assignment.confirmation_status <> 'cancelled'
        and assignment.starts_on <= occurrence_end and assignment.ends_on >= occurrence_start
    ) then
      raise exception using errcode = '23P01', message = format(
        'PLANNING_ROTATION_OVERLAP: marin deja affecte du %s au %s.', occurrence_start, occurrence_end
      );
    end if;

    insert into public.planning_assignments (
      company_id, vessel_id, captain_person_id, crew_person_id, starts_on, ends_on, starts_at, ends_at,
      assignment_role, status_label, confirmation_status, watch_group, comments, source_label
    ) values (
      target_company_id, p_vessel_id, p_captain_person_id, p_crew_person_id, occurrence_start, occurrence_end,
      (occurrence_start + time '08:00') at time zone 'Europe/Paris',
      (occurrence_end + time '20:00') at time zone 'Europe/Paris',
      trim(p_assignment_role), 'Embarque', p_confirmation_status,
      nullif(trim(coalesce(p_watch_group, '')), ''), 'Rotation ' || trim(p_name), 'seapilot_rotation'
    ) returning id into target_assignment_id;

    insert into public.planning_rotation_occurrences (
      company_id, series_id, assignment_id, occurrence_number, starts_on, ends_on,
      rest_starts_on, rest_ends_on, handover_at
    ) values (
      target_company_id, target_series_id, target_assignment_id, occurrence_number,
      occurrence_start, occurrence_end, occurrence_end + 1, occurrence_end + p_rest_days,
      (occurrence_start + time '08:00') at time zone 'Europe/Paris'
    );
  end loop;
  return target_series_id;
end;
$$;

revoke all on function public.save_planning_rotation_series(bigint, bigint, bigint, text, text, date, integer, integer, integer, text, text, integer, text) from public, anon;
grant execute on function public.save_planning_rotation_series(bigint, bigint, bigint, text, text, date, integer, integer, integer, text, text, integer, text) to authenticated;
