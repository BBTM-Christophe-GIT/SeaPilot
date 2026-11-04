-- Separate RH controls patch the same private record without overwriting each
-- other's values (notably salary in Contract and SSN in Identity).
create function public.patch_hr_employment_contract_details(p_person_id bigint, p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  target_company bigint := public.current_planning_company_id();
  result jsonb;
begin
  if auth.uid() is null or not public.has_company_role(target_company, array['admin','direction']) then
    raise exception 'Les données contractuelles sont réservées à Administration et Direction.' using errcode='42501';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or octet_length(p_patch::text) > 10000 then
    raise exception 'Les informations du contrat sont invalides.' using errcode='22023';
  end if;
  if exists (select 1 from jsonb_each(p_patch) field
    where field.key not in ('socialSecurityNumber','vesselNames','collectiveAgreement','grossMonthlySalary','endDate','employerRepresentative')
      or jsonb_typeof(field.value) <> 'string'
      or length(field.value #>> '{}') > case when field.key in ('vesselNames','collectiveAgreement') then 1200 else 240 end) then
    raise exception 'Champ contractuel inconnu ou valeur invalide.' using errcode='22023';
  end if;
  if not exists(select 1 from public.people p where p.id=p_person_id and p.company_id=target_company) then
    raise exception 'Fiche RH introuvable dans cette entreprise.' using errcode='42501';
  end if;
  insert into public.hr_employment_contract_details as details(person_id,company_id,input_data)
  values(p_person_id,target_company,p_patch)
  on conflict(person_id) do update set input_data=details.input_data || excluded.input_data
  returning input_data into result;
  return result;
end $$;
revoke all on function public.patch_hr_employment_contract_details(bigint,jsonb) from public,anon;
grant execute on function public.patch_hr_employment_contract_details(bigint,jsonb) to authenticated;

-- Enforce the fixed Contract section boundary even when a configurable RH
-- visibility rule is edited from Administration.
insert into public.hr_visibility_rules(scope,item_key,item_label,visible_to_roles)
values('section','contract','Contrat et dates',array['admin','direction'])
on conflict(scope,item_key) do update set visible_to_roles=excluded.visible_to_roles;
alter table public.hr_visibility_rules add constraint hr_contract_section_private
check(scope <> 'section' or item_key <> 'contract' or visible_to_roles <@ array['admin','direction']);

-- Inspect the final row AFTER employment-history synchronization: both legacy
-- dates and explicit employment_periods edits must respect this boundary.
create function public.hr_guard_contract_section_writes()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare changed boolean;
begin
  if auth.uid() is null then return new; end if; -- trusted service/import jobs
  if tg_op='INSERT' then
    changed := new.contract_type is not null or new.hired_on is not null or new.departed_on is not null
      or new.departure_reason is not null or new.employment_periods <> '[]'::jsonb;
  else
    changed := row(new.contract_type,new.hired_on,new.departed_on,new.departure_reason,new.employment_periods)
      is distinct from row(old.contract_type,old.hired_on,old.departed_on,old.departure_reason,old.employment_periods);
  end if;
  if changed and not public.has_company_role(new.company_id,array['admin','direction']) then
    raise exception 'HR_PERMISSION_DENIED: Contrat et dates est réservé à Administration et Direction.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.hr_guard_contract_section_writes() from public,anon,authenticated;
create trigger people_contract_section_guard after insert or update on public.people
for each row execute function public.hr_guard_contract_section_writes();

-- Preserve protected columns when a partial self-profile payload omits them.
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
      contract_type = case when p_details ? 'contract_type' then nullif(trim(p_details->>'contract_type'), '') else person.contract_type end,
      hired_on = case when p_details ? 'hired_on' then nullif(trim(p_details->>'hired_on'), '')::date else person.hired_on end,
      departed_on = case when p_details ? 'departed_on' then nullif(trim(p_details->>'departed_on'), '')::date else person.departed_on end,
      departure_reason = case when p_details ? 'departure_reason' then nullif(trim(p_details->>'departure_reason'), '') else person.departure_reason end,
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
