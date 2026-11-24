begin;

do $test$
declare
  company bigint;
  other_company bigint;
  actor uuid;
  vessel_id bigint;
  actor_role text;
  main_admin constant uuid := '8d33c1c4-7068-4d43-8bff-18dc77c80001';
  other_admin constant uuid := '8d33c1c4-7068-4d43-8bff-18dc77c80002';
  captain constant uuid := '8d33c1c4-7068-4d43-8bff-18dc77c80003';
  marin constant uuid := '8d33c1c4-7068-4d43-8bff-18dc77c80004';
  layout_initial constant jsonb := '[
    {"id":"identification","label":"Identification","fields":[{"id":"flagState","label":"Pavillon"}]},
    {"id":"dimensions","label":"Dimensions","fields":[{"id":"lengthOverall","label":"Longueur hors tout"}]}
  ]';
  layout_modified constant jsonb := '[
    {"id":"dimensions","label":"Gabarit","labelEn":"Dimensions","fields":[{"id":"lengthOverall","label":"Longueur","labelEn":"Length"},{"id":"flagState","label":"Pavillon"}]},
    {"id":"identification","label":"Identification","fields":[]}
  ]';
  bilingual_cover constant jsonb := '{"fr":{"missionsTitle":"Missions du navire"},"en":{"subtitle":"Survey vessel","summary":"Inshore services","missionsTitle":"Operations","operations":["Survey","Crew transfer"],"fieldValues":{"deckEquipment":"Main deck\nRear platform"}}}';
  invalid_layout jsonb;
  actual_layout jsonb;
begin
  insert into public.companies (code, name) values ('fleet-layout-test', 'Fleet Layout Test') returning id into company;
  insert into public.companies (code, name) values ('fleet-layout-test-other', 'Fleet Layout Other') returning id into other_company;

  for actor, actor_role in select * from (values (main_admin, 'admin'), (captain, 'capitaine'), (marin, 'marin')) actors(id, role_key) loop
    insert into auth.users (id, email) values (actor, 'fleet-layout-' || actor_role || '@example.invalid');
    insert into public.profiles (id, email, display_name, active_company_id)
      values (actor, 'fleet-layout-' || actor_role || '@example.invalid', 'Fleet layout ' || actor_role, company);
    insert into public.user_roles (user_id, company_id, role_key) values (actor, company, actor_role);
  end loop;
  insert into auth.users (id, email) values (other_admin, 'fleet-layout-other@example.invalid');
  insert into public.profiles (id, email, display_name, active_company_id)
    values (other_admin, 'fleet-layout-other@example.invalid', 'Fleet layout other admin', other_company);
  insert into public.user_roles (user_id, company_id, role_key) values (other_admin, other_company, 'admin');
  insert into public.company_memberships (user_id, company_id, active) values (main_admin, other_company, true);
  insert into public.user_roles (user_id, company_id, role_key) values (main_admin, other_company, 'admin');


  insert into public.vessels (company_id, name, asset_kind) values (company, 'FLEET BROCHURE TEST', 'vessel')
    returning id, brochure_cover into vessel_id, actual_layout;
  assert actual_layout = '{}'::jsonb, 'Vessels start with no localized cover or table overrides';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', main_admin::text, true);
  select layout into actual_layout from public.fleet_vessel_layouts where company_id = company;
  assert not found, 'Unconfigured company has no row and uses the default layout';

  insert into public.fleet_vessel_layouts (company_id, layout) values (company, layout_initial)
    on conflict (company_id) do update set company_id = excluded.company_id, layout = excluded.layout;
  insert into public.fleet_vessel_layouts (company_id, layout) values (company, layout_modified)
    on conflict (company_id) do update set company_id = excluded.company_id, layout = excluded.layout
    returning layout into actual_layout;
  assert actual_layout = layout_modified, 'Renaming, moving and reordering fields updates the single company row';

  update public.vessels set brochure_cover = bilingual_cover where id = vessel_id returning brochure_cover into actual_layout;
  assert actual_layout = bilingual_cover, 'The administrator can save both cover languages and English values';
  foreach invalid_layout in array array[
    '[]'::jsonb,
    '{"fr":{"subtitle":"Invalid location"}}'::jsonb,
    '{"en":{"summary":true}}'::jsonb,
    '{"en":{"operations":["Survey",9]}}'::jsonb,
    '{"en":{"fieldValues":{"deckEquipment":[]}}}'::jsonb
  ] loop
    begin
      update public.vessels set brochure_cover = invalid_layout where id = vessel_id;
      raise exception 'Invalid cover accepted: %', invalid_layout;
    exception when check_violation then null;
    end;
  end loop;


  foreach invalid_layout in array array[
    '{}'::jsonb,
    '[]'::jsonb,
    '[{"id":"dimensions","label":"Dimensions","fields":{}}]'::jsonb,
    '[{"id":"dimensions","label":"Dimensions","fields":[{"id":"length","label":"Longueur","value":30}]}]'::jsonb,
    '[{"id":"dimensions","label":"Dimensions","fields":[{"id":"length","label":"Longueur"}]},
      {"id":"identification","label":"Identification","fields":[{"id":"length","label":"Longueur"}]}]'::jsonb
  ] loop
    begin
      update public.fleet_vessel_layouts set layout = invalid_layout where company_id = company;
      raise exception 'Invalid fleet layout accepted: %', invalid_layout;
    exception when check_violation then null;
    end;
  end loop;

  begin
    insert into public.fleet_vessel_layouts (company_id, layout) values (other_company, layout_initial);
    raise exception 'An admin cannot write into a company outside their active context';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', other_admin::text, true);
  insert into public.fleet_vessel_layouts (company_id, layout) values (other_company, layout_initial);
  select layout into actual_layout from public.fleet_vessel_layouts where company_id = company;
  assert not found, 'The other company admin cannot read the first company layout';

  foreach actor in array array[captain, marin] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    select layout into strict actual_layout from public.fleet_vessel_layouts where company_id = company;
    assert actual_layout = layout_modified, 'A real ship profile reads the shared layout';
    update public.fleet_vessel_layouts set layout = layout_initial where company_id = company;
    assert not found, 'A real ship profile cannot modify the shared layout';

    select brochure_cover into strict actual_layout from public.vessels where id = vessel_id;
    assert actual_layout = bilingual_cover, 'A real ship profile can read the vessel brochure translations';
    update public.vessels set brochure_cover = '{}'::jsonb where id = vessel_id;
    assert not found, 'A real ship profile cannot write vessel brochure translations';

    select layout into actual_layout from public.fleet_vessel_layouts where company_id = other_company;
    assert not found, 'A ship profile cannot read the other company layout';
  end loop;

  perform set_config('request.jwt.claim.sub', main_admin::text, true);
  select layout into actual_layout from public.fleet_vessel_layouts where company_id = other_company;
  assert not found, 'Membership elsewhere grants no read access outside active company';

  execute 'set local role anon';
  begin
    perform 1 from public.fleet_vessel_layouts;
    raise exception 'The layout must not be accessible anonymously';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end;
$test$;

rollback;
