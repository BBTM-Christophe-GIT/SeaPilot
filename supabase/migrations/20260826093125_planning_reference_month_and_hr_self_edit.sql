-- Keep the Planning server validation aligned with the month selected in the UI,
-- and expose a narrowly-scoped self-service HR update path for sailors/captains.

create or replace function public.add_planning_board_row_for_month(
  p_vessel_id bigint,
  p_watch_group text,
  p_person_id bigint,
  p_reference_month date
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_person public.people%rowtype;
  normalized_watch_group text := trim(coalesce(p_watch_group, ''));
  reference_month_start date;
  reference_month_end date;
  saved_id bigint;
begin
  if p_reference_month is null then
    raise exception using errcode = '22023', message = 'PLANNING_VALIDATION: le mois de référence est obligatoire.';
  end if;

  reference_month_start := date_trunc('month', p_reference_month)::date;
  reference_month_end := (reference_month_start + interval '1 month - 1 day')::date;

  if target_company_id is null
    or not public.planning_user_can(
      'edit_event', target_company_id, p_vessel_id, reference_month_start, reference_month_end
    ) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: ajout d''une ligne de bordée.';
  end if;

  if normalized_watch_group = '' then
    raise exception using errcode = '22023', message = 'PLANNING_VALIDATION: la bordée est obligatoire.';
  end if;

  if not exists (
    select 1
    from public.vessels vessel
    where vessel.id = p_vessel_id
      and vessel.company_id = target_company_id
  ) then
    raise exception using errcode = 'P0002', message = 'PLANNING_STALE_DATA: navire introuvable.';
  end if;

  select person.* into target_person
  from public.people person
  where person.id = p_person_id
    and person.company_id = target_company_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'PLANNING_STALE_DATA: marin introuvable.';
  end if;

  if (target_person.hired_on is not null and target_person.hired_on > reference_month_end)
    or (target_person.departed_on is not null and target_person.departed_on < reference_month_start) then
    raise exception using
      errcode = '22023',
      message = 'PLANNING_VALIDATION: les dates d''emploi du marin ne couvrent pas le mois de référence.';
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

revoke all on function public.add_planning_board_row_for_month(bigint, text, bigint, date) from public, anon;
grant execute on function public.add_planning_board_row_for_month(bigint, text, bigint, date) to authenticated;

comment on function public.add_planning_board_row_for_month(bigint, text, bigint, date) is
  'Adds or refreshes a sailor board row when their employment dates overlap the selected reference month.';

create or replace function public.update_own_hr_profile(
  p_person_id bigint,
  p_details jsonb
)
returns public.people
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_person public.people%rowtype;
begin
  if auth.uid() is null or jsonb_typeof(p_details) is distinct from 'object' then
    raise exception using errcode = '42501', message = 'HR_PERMISSION_DENIED: modification de la fiche personnelle.';
  end if;

  select person.* into target_person
  from public.people person
  where person.id = p_person_id
    and person.user_id = auth.uid();

  if not found
    or not public.user_belongs_to_company(target_person.company_id)
    or not public.has_company_role(target_person.company_id, array['capitaine', 'marin']) then
    raise exception using errcode = '42501', message = 'HR_PERMISSION_DENIED: modification de la fiche personnelle.';
  end if;

  if nullif(trim(p_details->>'first_name'), '') is null
    or nullif(trim(p_details->>'last_name'), '') is null then
    raise exception using errcode = '22023', message = 'HR_VALIDATION: le prénom et le nom sont obligatoires.';
  end if;

  update public.people as person
  set first_name = trim(p_details->>'first_name'),
      last_name = trim(p_details->>'last_name'),
      email = nullif(trim(p_details->>'email'), ''),
      function_label = nullif(trim(p_details->>'function_label'), ''),
      grade_label = nullif(trim(p_details->>'grade_label'), ''),
      role_label = nullif(trim(p_details->>'role_label'), ''),
      register_label = nullif(trim(p_details->>'register_label'), ''),
      sex = nullif(trim(p_details->>'sex'), ''),
      sailor_number = nullif(trim(p_details->>'sailor_number'), ''),
      m365_account = nullif(trim(p_details->>'m365_account'), ''),
      phone = nullif(trim(p_details->>'phone'), ''),
      postal_address = nullif(trim(p_details->>'postal_address'), ''),
      birth_date = nullif(trim(p_details->>'birth_date'), '')::date,
      birth_place = nullif(trim(p_details->>'birth_place'), ''),
      identity_document_number = nullif(trim(p_details->>'identity_document_number'), ''),
      identity_document_type = nullif(trim(p_details->>'identity_document_type'), ''),
      contract_type = nullif(trim(p_details->>'contract_type'), ''),
      hired_on = nullif(trim(p_details->>'hired_on'), '')::date,
      departed_on = nullif(trim(p_details->>'departed_on'), '')::date,
      departure_reason = nullif(trim(p_details->>'departure_reason'), ''),
      emergency_contact_name = nullif(trim(p_details->>'emergency_contact_name'), ''),
      emergency_contact_relationship = nullif(trim(p_details->>'emergency_contact_relationship'), ''),
      emergency_contact_phone = nullif(trim(p_details->>'emergency_contact_phone'), ''),
      emergency_contact_address = nullif(trim(p_details->>'emergency_contact_address'), ''),
      waist_size = nullif(trim(p_details->>'waist_size'), '')::numeric,
      chest_size = nullif(trim(p_details->>'chest_size'), '')::numeric,
      full_height_size = nullif(trim(p_details->>'full_height_size'), '')::numeric,
      inseam_size = nullif(trim(p_details->>'inseam_size'), '')::numeric,
      hip_size = nullif(trim(p_details->>'hip_size'), '')::numeric,
      weight_kg = nullif(trim(p_details->>'weight_kg'), '')::numeric,
      shoe_size = nullif(trim(p_details->>'shoe_size'), '')::numeric,
      coverall_size = nullif(trim(p_details->>'coverall_size'), ''),
      pants_size = nullif(trim(p_details->>'pants_size'), ''),
      jacket_size = nullif(trim(p_details->>'jacket_size'), ''),
      deck_certificate_label = nullif(trim(p_details->>'deck_certificate_label'), ''),
      engine_certificate_label = nullif(trim(p_details->>'engine_certificate_label'), ''),
      crane_training_on = nullif(trim(p_details->>'crane_training_on'), '')::date,
      crane_induction_on = nullif(trim(p_details->>'crane_induction_on'), '')::date,
      updated_at = now()
  where person.id = target_person.id
  returning person.* into target_person;

  return target_person;
end;
$$;

revoke all on function public.update_own_hr_profile(bigint, jsonb) from public, anon;
grant execute on function public.update_own_hr_profile(bigint, jsonb) to authenticated;

comment on function public.update_own_hr_profile(bigint, jsonb) is
  'Allows authenticated Captain and Sailor profiles to update only the editable columns of their own linked HR record.';

notify pgrst, 'reload schema';
