-- Allow optional Planning rows only for sailors without a departure date or with a future departure date.

create or replace function public.add_planning_board_row(
  p_vessel_id bigint,
  p_watch_group text,
  p_person_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_person public.people%rowtype;
  target_person_name text;
  normalized_watch_group text := trim(coalesce(p_watch_group, ''));
  saved_id bigint;
begin
  if target_company_id is null
    or not public.planning_user_can('edit_event', target_company_id, p_vessel_id, null, null) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: ajout d''une ligne de bordée.';
  end if;

  if normalized_watch_group = '' then
    raise exception using errcode = '22023', message = 'PLANNING_VALIDATION: la bordée est obligatoire.';
  end if;

  if not exists (
    select 1 from public.vessels vessel
    where vessel.id = p_vessel_id and vessel.company_id = target_company_id
  ) then
    raise exception using errcode = 'P0002', message = 'PLANNING_STALE_DATA: navire introuvable.';
  end if;

  select person.* into target_person
  from public.people person
  where person.id = p_person_id and person.company_id = target_company_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'PLANNING_STALE_DATA: marin introuvable.';
  end if;

  if target_person.departed_on is not null and target_person.departed_on <= current_date then
    raise exception using errcode = '22023', message = 'PLANNING_VALIDATION: seuls les marins sans date de départ ou dont la date de départ est postérieure à aujourd''hui peuvent être ajoutés comme ligne vide.';
  end if;

  target_person_name := trim(concat_ws(' ', target_person.first_name, target_person.last_name));

  if exists (
      select 1 from public.planning_assignments assignment
      where assignment.company_id = target_company_id
        and assignment.vessel_id = p_vessel_id
        and assignment.crew_person_id = p_person_id
        and assignment.watch_group = normalized_watch_group
    ) or exists (
      select 1 from public.planning_periods period
      where period.company_id = target_company_id
        and period.vessel_id = p_vessel_id
        and period.watch_group = normalized_watch_group
        and (period.person_id = p_person_id or lower(trim(period.crew_name)) = lower(target_person_name))
    ) or exists (
      select 1 from public.planning_days day_row
      where day_row.company_id = target_company_id
        and day_row.vessel_id = p_vessel_id
        and day_row.watch_group = normalized_watch_group
        and (day_row.person_id = p_person_id or lower(trim(day_row.crew_name)) = lower(target_person_name))
    ) then
    raise exception using errcode = '23505', message = 'PLANNING_BOARD_ROW_ALREADY_PRESENT: ce marin possède déjà un enregistrement sur cette ligne.';
  end if;

  insert into public.planning_board_rows (
    company_id, vessel_id, person_id, watch_group, function_label, created_by
  ) values (
    target_company_id,
    p_vessel_id,
    p_person_id,
    normalized_watch_group,
    coalesce(nullif(trim(target_person.function_label), ''), nullif(trim(target_person.grade_label), ''), 'Équipage'),
    auth.uid()
  )
  on conflict (company_id, vessel_id, watch_group, person_id)
  do update set
    function_label = excluded.function_label,
    updated_at = now()
  returning id into saved_id;

  return saved_id;
end;
$$;

revoke all on function public.add_planning_board_row(bigint, text, bigint) from public, anon;
grant execute on function public.add_planning_board_row(bigint, text, bigint) to authenticated;

comment on function public.add_planning_board_row(bigint, text, bigint) is
  'Adds a sailor without a departure date or with a future departure date as an empty row in one vessel watch group.';
