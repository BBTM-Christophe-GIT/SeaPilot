-- Real Admin, Direction, Capitaine and Marin accounts in a rolled-back fixture.
begin;

do $$
declare
  company bigint;
  foreign_company bigint;
  canonical_person bigint;
  alias_person bigint;
  homonym bigint;
  foreign_person bigint;
  foreign_alias bigint;
  actor uuid;
  role_name text;
  actor_number integer := 0;
  snapshot jsonb;
begin
  assert not has_table_privilege('anon', 'public.admin_people_directory', 'SELECT'), 'Anonymous directory access';
  assert not has_table_privilege('authenticated', 'private.people_directory_aliases', 'INSERT,UPDATE,DELETE,TRUNCATE'), 'Alias maintenance exposed to application roles';
  select id into strict company from public.companies where code = 'bbtm';
  insert into public.companies(code, name) values ('people-directory-fixture', 'People directory fixture') returning id into foreign_company;

  insert into public.people(company_id, first_name, last_name, employee_number, sailor_number, hired_on, active)
  values (company, 'Camille', 'DURAND', 'DIR-001', 'DIR-MARIN-001', current_date - 1, true)
  returning id into canonical_person;
  insert into public.people(company_id, first_name, last_name, active) values (company, 'Camille', 'DURRAND', true) returning id into alias_person;
  insert into public.people(company_id, first_name, last_name, employee_number, hired_on, active)
  values (company, 'Camille', 'DURAND', 'DIR-002', current_date - 2, true)
  returning id into homonym;
  insert into public.people(company_id, first_name, last_name, employee_number, sailor_number, hired_on, active)
  values (foreign_company, 'Camille', 'DURAND', 'DIR-001', 'DIR-MARIN-001', current_date - 1, true)
  returning id into foreign_person;
  insert into public.people(company_id, first_name, last_name, active) values (foreign_company, 'Camille', 'DURRAND', true) returning id into foreign_alias;
  insert into private.people_directory_aliases(company_id, alias_person_id, canonical_person_id)
  values (company, alias_person, canonical_person), (foreign_company, foreign_alias, foreign_person);

  begin
    insert into private.people_directory_aliases(company_id, alias_person_id, canonical_person_id)
    values (company, homonym, foreign_person);
    raise exception 'Cross-company canonical identity accepted';
  exception when foreign_key_violation then null; end;

  begin
    insert into public.people(company_id, first_name, last_name, employee_number)
    values (company, 'Different', 'Name', ' dir-001 ');
    raise exception 'Duplicate employee number accepted';
  exception when unique_violation then null; end;

  begin
    update public.people set sailor_number = ' dir-marin-001 ' where id = homonym;
    raise exception 'Duplicate sailor number accepted';
  exception when unique_violation then null; end;

  foreach role_name in array array['admin', 'direction', 'capitaine', 'marin'] loop
    actor_number := actor_number + 1;
    actor := ('a9580000-0000-4000-8000-00000000010' || actor_number)::uuid;
    insert into auth.users(id,email) values (actor, 'people-directory-' || role_name || '@example.invalid');
    insert into public.profiles(id, email, display_name, active_company_id)
    values (actor, 'people-directory-' || role_name || '@example.invalid', 'People directory fixture', company);
    insert into public.company_memberships(company_id, user_id, active) values (company, actor, true)
    on conflict (company_id, user_id) do update set active = true;
    insert into public.user_roles(user_id, company_id, role_key) values (actor, company, role_name);

    perform set_config('request.jwt.claim.sub', actor::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if role_name = 'admin' then
      assert (select count(*) = 2 from public.admin_people_directory where id in (canonical_person, homonym)), 'Admin directory dropped valid collaborators';
      assert not exists (select 1 from public.admin_people_directory where id in (alias_person, foreign_person, foreign_alias)), 'Admin directory returned an alias or foreign collaborator';
      assert exists (select 1 from public.people where id = alias_person and active), 'Historical person record was removed or deactivated';
      begin
        update public.people set user_id = actor where id = alias_person;
        raise exception 'Historical alias accepted an account link';
      exception when check_violation then null; end;
    else
      assert not exists (select 1 from public.admin_people_directory), 'Admin directory exposed to another role';
    end if;

    if role_name in ('admin', 'direction') then
      assert exists (select 1 from private.people_directory_aliases where alias_person_id = alias_person), 'Alias filter could not access same-company identities';
      assert not exists (select 1 from private.people_directory_aliases where company_id = foreign_company), 'Foreign alias metadata leaked';
      snapshot := public.organigramme_snapshot_v2(current_date);
      assert (select count(*) = 2 from jsonb_array_elements(snapshot->'people') as entries(person) where (person->>'id')::bigint in (canonical_person, homonym)), 'Organigramme dropped valid collaborators';
      assert not exists (select 1 from jsonb_array_elements(snapshot->'people') as entries(person) where (person->>'id')::bigint in (alias_person, foreign_person, foreign_alias)), 'Organigramme returned an alias or foreign collaborator';
      begin
        perform public.save_organigramme_emergency_default(array[alias_person]);
        raise exception 'Historical alias accepted in emergency defaults';
      exception when insufficient_privilege then null; end;
    else
      assert not exists (select 1 from private.people_directory_aliases), 'Alias metadata exposed to a forbidden role';
    end if;
    execute 'reset role';
  end loop;
end;
$$;

rollback;
