begin;

do $test$
declare
  company bigint;
  ship_id bigint;
  actor uuid;
  actor_role text;
  vessel public.vessels;
  invalid_value numeric;
begin
  select id into strict company from public.companies where code = 'bbtm';
  insert into public.vessels(company_id, name, asset_kind, lightship_tonnes)
    values (company, 'FLEET MEASUREMENTS TEST', 'vessel', 400)
    returning * into vessel;
  ship_id := vessel.id;
  assert vessel.net_tonnage is null and vessel.summer_freeboard_mm is null,
    'Lightship displacement does not supply either of the new measurements';

  for actor, actor_role in select * from (values
    ('6ac32100-0000-4000-8000-000000000001'::uuid, 'admin'),
    ('6ac32100-0000-4000-8000-000000000002'::uuid, 'capitaine'),
    ('6ac32100-0000-4000-8000-000000000003'::uuid, 'marin')
  ) roles(id, role_key) loop
    insert into auth.users(id, email) values (actor, 'fleet-measurements-' || actor_role || '@example.invalid');
    insert into public.profiles(id, email, display_name, active_company_id)
      values (actor, 'fleet-measurements-' || actor_role || '@example.invalid', 'Fleet measurements ' || actor_role, company);
    insert into public.company_memberships(company_id, user_id, active) values (company, actor, true)
      on conflict (company_id, user_id) do update set active = true;
    insert into public.user_roles(user_id, company_id, role_key) values (actor, company, actor_role);
  end loop;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '6ac32100-0000-4000-8000-000000000001', true);
  update public.vessels set net_tonnage = 93, summer_freeboard_mm = 745.5 where id = ship_id returning * into vessel;
  assert found and vessel.net_tonnage = 93 and vessel.summer_freeboard_mm = 745.5 and vessel.lightship_tonnes = 400,
    'An administrator can save both measurements while preserving the historical lightship displacement';

  foreach invalid_value in array array[-1::numeric, 'Infinity'::numeric, 'NaN'::numeric] loop
    begin
      update public.vessels set net_tonnage = invalid_value where id = ship_id;
      raise exception 'Invalid net tonnage accepted: %', invalid_value;
    exception when check_violation then null;
    end;
    begin
      update public.vessels set summer_freeboard_mm = invalid_value where id = ship_id;
      raise exception 'Invalid summer freeboard accepted: %', invalid_value;
    exception when check_violation then null;
    end;
  end loop;

  for actor in select unnest(array[
    '6ac32100-0000-4000-8000-000000000002'::uuid,
    '6ac32100-0000-4000-8000-000000000003'::uuid
  ]) loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    select * into strict vessel from public.vessels where id = ship_id;
    assert vessel.net_tonnage = 93 and vessel.summer_freeboard_mm = 745.5,
      'A crew profile can read vessel measurements';
    update public.vessels set net_tonnage = 1, summer_freeboard_mm = 2 where id = ship_id;
    assert not found, 'A crew profile cannot edit vessel measurements';
  end loop;

  perform set_config('request.jwt.claim.sub', '6ac32100-0000-4000-8000-000000000001', true);
  update public.vessels set net_tonnage = null, summer_freeboard_mm = null where id = ship_id returning * into vessel;
  assert found and vessel.net_tonnage is null and vessel.summer_freeboard_mm is null and vessel.lightship_tonnes = 400,
    'Clearing the new fields preserves the historical lightship displacement';

  execute 'reset role';
end;
$test$;

rollback;
