-- Exercise the real authenticated profiles and roll back all fixture data.
begin;
do $$
declare
  company bigint;
  other_company bigint;
  active_vessel bigint;
  inactive_vessel bigint;
  foreign_vessel bigint;
  actor uuid;
  role_name text;
  saved record;
  first_occurrence_id bigint;
  occurrence_ids bigint[] := '{}';
  released jsonb;
  planning_date date := date '2039-01-02';
begin
  insert into public.companies(code, name)
  values ('hp-test-' || gen_random_uuid(), 'Hors Projet fixture') returning id into company;
  insert into public.companies(code, name)
  values ('hp-test-' || gen_random_uuid(), 'Hors Projet other company') returning id into other_company;
  insert into public.vessels(company_id, name, active)
  values (company, 'HP active vessel', true) returning id into active_vessel;
  insert into public.vessels(company_id, name, active)
  values (company, 'HP inactive vessel', false) returning id into inactive_vessel;
  insert into public.vessels(company_id, name, active)
  values (other_company, 'HP foreign vessel', true) returning id into foreign_vessel;

  foreach role_name in array array['admin', 'direction', 'armement', 'capitaine', 'marin'] loop
    actor := gen_random_uuid();
    insert into auth.users(id, email) values (actor, actor || '@example.invalid');
    insert into public.profiles(id, email, display_name, active_company_id)
    values (actor, actor || '@example.invalid', 'Hors Projet test', company);
    insert into public.company_memberships(company_id, user_id, active)
    values (company, actor, true) on conflict (company_id, user_id) do update set active = true;
    insert into public.user_roles(user_id, company_id, role_key) values (actor, company, role_name);
    perform set_config('request.jwt.claim.sub', actor::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    if role_name in ('admin', 'direction', 'armement') then
      select * into strict saved
      from public.planning_create_out_of_project(E'\t Travaux de pont  ', active_vessel, planning_date);
      assert saved.title = 'HP - Travaux de pont', 'Code and trimmed name must be persisted';
      assert saved.catalog_project_id is null, 'A Hors Projet operation has no commercial project';
      assert saved.status = 'Brouillon' and saved.event_type = 'operation', 'Create a draft operation';
      assert saved.source_label = 'seapilot-hors-projet', 'The presentation marker must be available';
      assert saved.starts_on = planning_date and saved.ends_on = planning_date, 'Use the selected cell date';
      assert saved.primary_vessel_id = active_vessel and saved.primary_vessel_name = 'HP active vessel', 'Use the selected vessel';
      assert saved.id <> all(occurrence_ids), 'Names and the HP code may be reused';
      occurrence_ids := array_append(occurrence_ids, saved.id);
      assert exists (
        select 1 from public.planning_operations_view overview
        where overview.id = saved.id and overview.source_label = saved.source_label
          and overview.vessel_ids = array[active_vessel]
      ), 'Persist the operation in the fleet overview';

      if role_name = 'admin' then
        first_occurrence_id := saved.id;
        update public.planning_projects
        set title = 'HP - Travaux de pont modifiés', source_label = 'seapilot-admin', ends_on = planning_date + 1
        where id = first_occurrence_id;
        assert exists (
          select 1 from public.planning_operations_view overview
          where overview.id = first_occurrence_id and overview.source_label = 'seapilot-hors-projet'
            and overview.title = 'HP - Travaux de pont modifiés' and overview.ends_on = planning_date + 1
        ), 'Generic Planning edits must preserve the identity and accept an updated name and date';
        begin
          update public.planning_projects set title = 'P42 - Incorrect', source_label = 'seapilot-admin' where id = first_occurrence_id;
          raise exception 'A change of the HP code was accepted';
        exception when check_violation then null;
        end;
        begin
          perform public.planning_create_out_of_project(E' \t\n ', active_vessel, planning_date);
          raise exception 'Blank title accepted';
        exception when invalid_parameter_value then null;
        end;
        begin
          perform public.planning_create_out_of_project(repeat('x', 301), active_vessel, planning_date);
          raise exception 'Overlong title accepted';
        exception when invalid_parameter_value then null;
        end;
        begin
          perform public.planning_create_out_of_project('Missing date', active_vessel, null);
          raise exception 'Missing date accepted';
        exception when invalid_parameter_value then null;
        end;
        begin
          perform public.planning_create_out_of_project('Inactive vessel', inactive_vessel, planning_date);
          raise exception 'Inactive vessel accepted';
        exception when invalid_parameter_value then null;
        end;
        begin
          perform public.planning_create_out_of_project('Foreign vessel', foreign_vessel, planning_date);
          raise exception 'Foreign vessel accepted';
        exception when invalid_parameter_value then null;
        end;
        perform public.publish_planning_release();
      end if;
    else
      begin
        perform public.planning_create_out_of_project('Forbidden', active_vessel, planning_date);
        raise exception 'A read-only profile was allowed to create an operation';
      exception when insufficient_privilege then null;
      end;
      released := public.latest_planning_release();
      assert exists (
        select 1 from jsonb_array_elements(released #> '{snapshot,projects}') as operation
        where operation ->> 'id' = first_occurrence_id::text
          and operation ->> 'title' = 'HP - Travaux de pont modifiés'
          and operation ->> 'source_label' = 'seapilot-hors-projet'
          and not operation ? 'charter_hire'
      ), 'Marin and Capitaine must see HP in the published Planning data without financial details';
    end if;
    execute 'reset role';
  end loop;

  assert (select count(*) from public.planning_projects where company_id = company) = 3, 'Only authorized writes may persist';
  assert not exists (select 1 from public.projects where company_id = company), 'No commercial project may be created';
  assert not has_function_privilege('anon', 'public.planning_create_out_of_project(text,bigint,date)', 'execute'), 'Anonymous execution allowed';
end;
$$;
rollback;
