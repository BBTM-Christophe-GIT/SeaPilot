-- Store the internal employee number as text so leading zeroes remain intact.
alter table public.people
  add column if not exists employee_number text;

comment on column public.people.employee_number is
  'Internal employee number stored as text to preserve leading zeroes.';

create index if not exists people_company_employee_number_idx
  on public.people (company_id, employee_number)
  where employee_number is not null;

insert into public.sharepoint_field_mappings (
  source_key,
  field_label,
  internal_name,
  data_type,
  target_table,
  target_column,
  required,
  notes
)
values (
  'list-rh-personnel-bbtm',
  'Matricule',
  'Matricule',
  'Text',
  'people',
  'employee_number',
  false,
  'Conservé comme texte afin de préserver les zéros initiaux.'
)
on conflict (source_key, internal_name, target_table, target_column) do update
set field_label = excluded.field_label,
    data_type = excluded.data_type,
    required = excluded.required,
    notes = excluded.notes,
    updated_at = now();

-- An incomplete second import recreated Nicolas Bodinier as active after his
-- departure. Keep both historical rows, but close the active duplicate with
-- the known employment dates instead of introducing a UI-only name filter.
with departed_record as (
  select distinct on (person.company_id, lower(trim(person.first_name)), lower(trim(person.last_name)))
    person.id,
    person.company_id,
    person.first_name,
    person.last_name,
    person.hired_on,
    person.departed_on,
    person.departure_reason
  from public.people person
  join public.companies company on company.id = person.company_id
  where company.code = 'bbtm'
    and lower(trim(person.first_name)) = 'nicolas'
    and lower(trim(person.last_name)) = 'bodinier'
    and not person.active
    and person.departed_on is not null
  order by
    person.company_id,
    lower(trim(person.first_name)),
    lower(trim(person.last_name)),
    person.departed_on desc,
    person.id
)
update public.people duplicate
set active = false,
    hired_on = coalesce(duplicate.hired_on, departed_record.hired_on),
    departed_on = coalesce(duplicate.departed_on, departed_record.departed_on),
    departure_reason = coalesce(nullif(trim(duplicate.departure_reason), ''), departed_record.departure_reason),
    updated_at = now()
from departed_record
where duplicate.company_id = departed_record.company_id
  and duplicate.id <> departed_record.id
  and lower(trim(duplicate.first_name)) = lower(trim(departed_record.first_name))
  and lower(trim(duplicate.last_name)) = lower(trim(departed_record.last_name))
  and duplicate.active;

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
      employee_number = nullif(trim(p_details->>'employee_number'), ''),
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
