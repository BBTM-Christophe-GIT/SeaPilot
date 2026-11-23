begin;

do $$
declare
  company bigint;
  other_company bigint;
  foreign_person bigint;
  actors uuid[] := array[]::uuid[];
  actor uuid;
  role_key text;
  actor_index integer := 0;
  cdd_person bigint;
  cdi_person bigint;
  rehired_person bigint;
  booked_person bigint;
  departure_person bigint;
  resignation_person bigint;
  invalid_person bigint;
  new_date text := to_char(current_date + 20, 'YYYY-MM-DD');
  old_date text := to_char(current_date + 14, 'YYYY-MM-DD');
  current_start date := current_date - 10;
  snapshot jsonb;
  cards jsonb;
begin
  assert not has_function_privilege('anon', 'public.organigramme_snapshot_v4(bigint,date)', 'EXECUTE');
  select id into strict company from public.companies where code = 'bbtm';
  insert into public.companies (code, name)
    values ('org-contract-foreign', 'Organigramme contractuel tiers') returning id into other_company;

  foreach role_key in array array['admin', 'direction', 'armement', 'capitaine', 'marin'] loop
    actor_index := actor_index + 1;
    actor := ('a1200000-0000-4000-9000-00000000000' || actor_index)::uuid;
    actors := array_append(actors, actor);
    insert into auth.users (id, email) values (actor, 'org-contract-' || role_key || '@example.invalid');
    insert into public.profiles (id, email, display_name, active_company_id)
      values (actor, 'org-contract-' || role_key || '@example.invalid', 'Contrat organigramme', company);
    insert into public.company_memberships (company_id, user_id, active) values (company, actor, true)
      on conflict (company_id, user_id) do update set active = true;
    insert into public.user_roles (company_id, user_id, role_key) values (company, actor, role_key);
  end loop;

  insert into public.people (company_id, user_id, first_name, last_name, active, hired_on, contract_type)
    values (company, actors[5], 'CDD', 'FORMULAIRE', true, current_start, 'CDD') returning id into cdd_person;
  insert into public.people (company_id, user_id, first_name, last_name, active, hired_on, contract_type)
    values (company, actors[4], 'CDI', 'FORMULAIRE', true, current_start, 'CDI') returning id into cdi_person;
  insert into public.people (company_id, first_name, last_name, active, hired_on, contract_type)
    values (company, 'CDD', 'INVALIDE', true, current_start, 'CDD') returning id into invalid_person;
  insert into public.people (company_id, first_name, last_name, active, hired_on, contract_type)
    values (company, 'CDD', 'RENOUVELÉ', true, current_date - 60, 'CDD') returning id into rehired_person;
  insert into public.people (company_id, first_name, last_name, active, hired_on, contract_type)
    values (company, 'CDD', 'DOCUMENT', true, current_start, 'CDD') returning id into booked_person;
  insert into public.people (company_id, first_name, last_name, active, hired_on, departed_on, contract_type, departure_reason)
    values (company, 'CDD', 'ÉCHÉANCE', true, current_start, current_date + 3, 'CDD', 'Fin de contrat')
    returning id into departure_person;
  insert into public.people (company_id, first_name, last_name, active, hired_on, departed_on, contract_type, departure_reason)
    values (company, 'CDI', 'DÉMISSION', true, current_start, current_date + 5, 'CDI', 'Démission')
    returning id into resignation_person;
  insert into public.people (company_id, first_name, last_name, active, hired_on, contract_type)
    values (other_company, 'CDD', 'TIERS', true, current_start, 'CDD') returning id into foreign_person;

  perform set_config('request.jwt.claim.sub', actors[1]::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', actors[1], 'role', 'authenticated')::text, true);
  -- Existing RH records with no saved start date must still be recognized when unambiguous.
  insert into public.hr_employment_contract_details (company_id, person_id, input_data) values
    (company, cdd_person, jsonb_build_object(
      'endDate', new_date, 'socialSecurityNumber', 'ORG-CONTRACT-PRIVATE-FIXTURE', 'grossMonthlySalary', '12345')),
    (company, cdi_person, jsonb_build_object('endDate', old_date)),
    (company, invalid_person, jsonb_build_object('endDate', '2026-02-30')),
    (other_company, foreign_person, jsonb_build_object('endDate', old_date));

  insert into storage.objects (bucket_id, name, metadata) values
    ('hr-employment-contracts', company || '/people/' || booked_person || '/a1200000-0000-4000-9000-000000000010.pdf',
      '{"mimetype":"application/pdf","size":100}'),
    ('hr-employment-contracts', company || '/people/' || booked_person || '/a1200000-0000-4000-9000-000000000011.pdf',
      '{"mimetype":"application/pdf","size":100}');

  insert into public.hr_employment_contracts (
    company_id, person_id, contract_type, title, file_name, storage_path, file_size_bytes, input_data
  ) values
    (company, booked_person, 'CDD', 'Contrat courant', 'Contrat.pdf',
      company || '/people/' || booked_person || '/a1200000-0000-4000-9000-000000000010.pdf', 100,
      jsonb_build_object('startDate', current_start, 'endDate', new_date)),
    (company, booked_person, 'CDD', 'Ancien contrat', 'Contrat.pdf',
      company || '/people/' || booked_person || '/a1200000-0000-4000-9000-000000000011.pdf', 100,
      jsonb_build_object('startDate', current_start - 90, 'endDate', old_date));

  execute 'set local role authenticated';
  perform public.patch_hr_employment_contract_details(rehired_person, jsonb_build_object('endDate', old_date));
  if not exists (
    select 1 from jsonb_array_elements(public.organigramme_snapshot_v4(0, current_date)->'people') card
    where (card->>'id')::bigint = rehired_person and card->>'contractEndDate' = old_date
  ) then
    raise exception 'The date saved for the current employment period is missing';
  end if;
  update public.people set employment_periods = jsonb_build_array(
    jsonb_build_object('hiredOn', current_date - 60, 'departedOn', current_date - 20,
      'contractType', 'CDD', 'departureReason', 'Fin de contrat'),
    jsonb_build_object('hiredOn', current_start, 'departedOn', '',
      'contractType', 'CDD', 'departureReason', '')
  ) where id = rehired_person;
  perform public.patch_hr_employment_contract_details(rehired_person, jsonb_build_object('grossMonthlySalary', '12345'));
  execute 'reset role';

  actor_index := 0;
  foreach role_key in array array['admin', 'direction', 'armement', 'capitaine', 'marin'] loop
    actor_index := actor_index + 1;
    actor := actors[actor_index];
    perform set_config('request.jwt.claim.sub', actor::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if role_key in ('admin', 'direction') then
      snapshot := public.organigramme_snapshot_v4(0, current_date);
      select jsonb_object_agg(card->>'id', card) into cards from jsonb_array_elements(snapshot->'people') card;

      assert cards->cdd_person::text->>'contractType' = 'CDD'
        and cards->cdd_person::text->>'contractEndDate' = new_date, 'CDD from the RH profile missing';
      assert cards->cdi_person::text->>'contractType' = 'CDI'
        and cards->cdi_person::text->'contractEndDate' = 'null'::jsonb, 'CDD data applied to a CDI';
      assert cards->booked_person::text->>'contractEndDate' = new_date, 'CDD from the current document missing';
      assert cards->departure_person::text->>'contractEndDate' = to_char(current_date + 2, 'YYYY-MM-DD'),
        'The legacy exclusive departure was not converted to the inclusive contract end';
      assert cards->resignation_person::text->'contractEndDate' = 'null'::jsonb, 'Resignation reported as contract end';
      assert cards->invalid_person::text->>'contractType' = 'CDD'
        and cards->invalid_person::text->'contractEndDate' = 'null'::jsonb, 'Malformed contract date reported';
      assert cards->rehired_person::text->>'contractType' = 'CDD'
        and cards->rehired_person::text->'contractEndDate' = 'null'::jsonb, 'Previous CDD end was reused on rehire';
      assert not cards ? foreign_person::text, 'Foreign company employee reported';
      assert not (cards->cdd_person::text ?| array['input_data', 'endDateEmploymentStart', 'socialSecurityNumber', 'grossMonthlySalary'])
        and snapshot::text not like '%ORG-CONTRACT-PRIVATE-FIXTURE%', 'Private contract fields reported';
      assert not exists (
        select 1 from jsonb_array_elements(public.organigramme_snapshot_v3(0, current_date)->'people') card
        where card ? 'contractType' or card ? 'contractEndDate'
      ), 'Legacy snapshot leaks new private fields';
    else
      begin
        perform public.organigramme_snapshot_v4(0, current_date);
        raise exception 'Unexpected org chart access by %', role_key;
      exception when insufficient_privilege then null; end;
      assert not exists (
        select 1 from public.hr_employment_contract_details where person_id = cdd_person
      ), 'Private contract details readable by another role';
    end if;
    execute 'reset role';
  end loop;
end;
$$;

rollback;
