-- Exercise the vessel settings and official requirements through authenticated entry points.
begin;

do $d217$
declare
  company bigint;
  foreign_company bigint;
  assigned_vessel bigint;
  unassigned_vessel bigint;
  foreign_vessel bigint;
  person bigint;
  base_lot bigint;
  bag_lot bigint;
  actor record;
  requirements jsonb;
  today date := (current_timestamp at time zone 'Europe/Paris')::date;
  bag_key constant text := 'sac medical d''urgence';
  stock constant jsonb := '{"designation":"Furosémide","medical_section":"medicines","stock_quantity":2,
    "stock_unit":"ampoule","strength":"20 mg / 2 ml","brand":"Marque fixture","package_size":3,"required_quantity":"999",
    "required_stock_quantity":999,"update_dotation_requirement":true}';
  first_count constant jsonb := '{"designation":"Furosémide","medical_section":"medicines","medical_dotation":"DOTATION B",
    "stock_quantity":0,"initialize_stock_quantity":true}';
begin
  assert not has_table_privilege('authenticated', 'pharmacy_private.d217_catalog', 'SELECT'),
    'The official catalog can only be read through a vessel-scoped RPC';
  assert not has_table_privilege('authenticated', 'pharmacy_private.d217_catalog', 'UPDATE'),
    'Connected users cannot change the regulatory catalog';
  assert not has_function_privilege('anon', 'public.list_pharmacy_dotation_requirements(bigint)', 'EXECUTE'),
    'Anonymous accounts cannot list vessel dotations';
  assert not has_function_privilege('anon', 'public.save_pharmacy_item(bigint,jsonb,bigint,integer)', 'EXECUTE'),
    'Anonymous accounts cannot enter first stock counts';

  insert into public.companies(code, name) values('d217-test', 'Division 217 fixture') returning id into company;
  insert into public.companies(code, name) values('d217-other', 'Division 217 other company') returning id into foreign_company;
  insert into public.vessels(company_id, name, asset_kind, medical_dotation)
    values(company, 'D217 ASSIGNED', 'vessel', 'Dotation médicale B - Médicaments (catégorie 2 - 200 miles)')
    returning id into assigned_vessel;
  insert into public.vessels(company_id, name, asset_kind, medical_dotation, medical_emergency_bag)
    values(company, 'D217 UNASSIGNED', 'vessel', 'DOTATION C restreinte', true) returning id into unassigned_vessel;
  insert into public.vessels(company_id, name, asset_kind, medical_dotation, medical_emergency_bag)
    values(foreign_company, 'D217 FOREIGN', 'vessel', 'DOTATION B', true) returning id into foreign_vessel;
  insert into public.role_module_permissions(role_key, module_key, is_visible)
    select key, 'pharmacy', true from public.roles where key in ('admin', 'capitaine', 'marin')
    on conflict(role_key, module_key) do update set is_visible = true;

  for actor in select * from (values
    ('d2170000-0000-4000-8000-000000000001'::uuid, 'admin'),
    ('d2170000-0000-4000-8000-000000000002'::uuid, 'capitaine'),
    ('d2170000-0000-4000-8000-000000000003'::uuid, 'marin')) fixture(id, role_key)
  loop
    insert into auth.users(id, email) values(actor.id, 'd217-' || actor.role_key || '@example.invalid');
    insert into public.profiles(id, email, display_name, active_company_id)
      values(actor.id, 'd217-' || actor.role_key || '@example.invalid', 'D217 ' || actor.role_key, company);
    insert into public.company_memberships(company_id, user_id, active) values(company, actor.id, true)
      on conflict(company_id, user_id) do update set active = true;
    insert into public.user_roles(company_id, user_id, role_key) values(company, actor.id, actor.role_key);
    if actor.role_key <> 'admin' then
      insert into public.people(company_id, user_id, first_name, last_name, active)
        values(company, actor.id, 'D217', actor.role_key, true) returning id into person;
      insert into public.planning_assignments(company_id, vessel_id, crew_person_id, starts_on, ends_on, assignment_role, confirmation_status)
        values(company, assigned_vessel, person, today - 1, today + 1, actor.role_key, 'confirmed');
    end if;
  end loop;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', 'd2170000-0000-4000-8000-000000000001', true);
  assert (select not medical_emergency_bag from public.pharmacy_available_vessels() where id = assigned_vessel),
    'Legacy vessels default to an unchecked bag';
  requirements := public.list_pharmacy_dotation_requirements(assigned_vessel);
  assert requirements @> '[{"dotation_key":"dotation b","medical_section":"medicines","designation":"Furosémide",
    "required_stock_quantity":4,"required_stock_unit":"ampoule","packaging":"ampoule 20 mg / 2 ml","source_page":22}]',
    'An imported Fleet label resolves to the official medication quantity and presentation';
  assert exists(select 1 from jsonb_array_elements(requirements) r
    where r->>'medical_section' = 'equipment' and r->>'designation' = 'Défibrillateur automatisé externe'
      and r->>'applicability' = 'recommended' and r->>'regulatory_notes' like '%non obligatoire%'),
    'The official equipment recommendation and remarks are returned';
  assert not exists(select 1 from jsonb_array_elements(requirements) r where r->>'dotation_key' <> 'dotation b'),
    'Only the assigned type is listed with the bag unchecked';
  assert not exists(select 1 from public.pharmacy_inventory where vessel_id = assigned_vessel),
    'Reading the regulation never invents onboard stock';
  begin
    perform public.save_pharmacy_item(assigned_vessel, stock || jsonb_build_object('medical_dotation', bag_key));
    raise exception 'Stock for an unchecked bag was accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.list_pharmacy_dotation_requirements(foreign_vessel);
    raise exception 'A user read a different company vessel catalog';
  exception when insufficient_privilege then null; end;

  update public.vessels set medical_emergency_bag = true where id = assigned_vessel;
  assert found, 'The admin can enable the bag from the vessel record';
  assert (select medical_emergency_bag from public.pharmacy_available_vessels() where id = assigned_vessel),
    'The pharmacy vessel RPC reflects the saved bag selection';
  perform public.save_pharmacy_item(assigned_vessel, stock || '{"outside_dotation":true}');
  perform public.save_pharmacy_item(assigned_vessel, stock || '{"active":false}');
  base_lot := public.save_pharmacy_item(assigned_vessel, first_count);
  assert (select stock_quantity = 0 and brand = '' and stock_packaging is null and required_stock_quantity = 4
    from public.pharmacy_inventory where id = base_lot), 'A zero first count is distinct from a blank count and leaves other stock fields blank';
  begin
    perform public.save_pharmacy_item(assigned_vessel, first_count || '{"designation":"  FUROSEMIDE  ","stock_quantity":3}');
    raise exception 'A retried first count created a second active lot for the same reference';
  exception when serialization_failure then null; end;
  perform public.save_pharmacy_item(assigned_vessel, stock, base_lot, 1);

  perform set_config('request.jwt.claim.sub', 'd2170000-0000-4000-8000-000000000002', true);
  assert (select can_manage and medical_emergency_bag from public.pharmacy_available_vessels() where id = assigned_vessel),
    'The assigned captain can manage stock for the active bag';
  requirements := public.list_pharmacy_dotation_requirements(assigned_vessel);
  assert (select count(*) = 2 from jsonb_array_elements(requirements) r where r->>'designation' = 'Furosémide'
    and r->>'dotation_key' in ('dotation b', bag_key)), 'Identical supplies are listed for both independently managed locations';
  update public.vessels set medical_emergency_bag = false where id = assigned_vessel;
  assert not found, 'A captain authorized for pharmacy stock cannot change the vessel settings';
  assert not exists(select 1 from public.pharmacy_available_vessels() where id = unassigned_vessel),
    'The bag flag does not widen the captain’s vessel scope';
  begin
    perform public.list_pharmacy_dotation_requirements(unassigned_vessel);
    raise exception 'A captain read an unassigned vessel dotation';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_pharmacy_item(unassigned_vessel, first_count);
    raise exception 'A captain entered the stock count of an unassigned vessel';
  exception when insufficient_privilege then null; end;
  bag_lot := public.save_pharmacy_item(assigned_vessel, stock || jsonb_build_object(
    'medical_dotation', bag_key, 'brand', 'Marque sac', 'stock_quantity', 1, 'stock_packaging', 'Emballage du sac',
    'expires_on', today + 3, 'expiry_precision', 'day', 'initialize_stock_quantity', true));
  assert (select stock_quantity = 1 and package_size = 3 and stock_packaging = 'Emballage du sac' and brand = 'Marque sac'
    and required_stock_quantity = 4 and required_quantity = '4' and medical_dotation = bag_key
    from public.pharmacy_inventory where id = bag_lot), 'Onboard stock is saved and the official quantity remains authoritative';
  assert (select stock_quantity = 2 and brand = 'Marque fixture' from public.pharmacy_inventory where id = base_lot),
    'The ship stock is independent from the emergency bag stock';
  assert (select count(*) = 2 from public.pharmacy_inventory_notifications() where item_id = bag_lot and kind in ('item', 'stock')),
    'An enabled bag enters the expiry and quantity alert scopes';

  perform set_config('request.jwt.claim.sub', 'd2170000-0000-4000-8000-000000000003', true);
  assert (select not can_manage and medical_emergency_bag from public.pharmacy_available_vessels() where id = assigned_vessel),
    'The assigned sailor can read the bag setting without stock management rights';
  assert public.list_pharmacy_dotation_requirements(assigned_vessel) = requirements,
    'The assigned sailor reads the same regulatory catalog as the captain';
  begin
    perform public.save_pharmacy_item(assigned_vessel, stock || jsonb_build_object('medical_dotation', bag_key), bag_lot, 1);
    raise exception 'A sailor edited the bag stock';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_pharmacy_item(assigned_vessel, first_count);
    raise exception 'A sailor entered a first count or could check for a competing count';
  exception when insufficient_privilege then null; end;
  update public.vessels set medical_emergency_bag = false where id = assigned_vessel;
  assert not found, 'The sailor cannot change the vessel settings';

  perform set_config('request.jwt.claim.sub', 'd2170000-0000-4000-8000-000000000001', true);
  update public.vessels set medical_dotation = 'DOTATION C restreinte', medical_emergency_bag = false where id = assigned_vessel;
  requirements := public.list_pharmacy_dotation_requirements(assigned_vessel);
  assert requirements @> '[{"dotation_key":"dotation c restreinte","designation":"Paracétamol",
    "required_stock_quantity":16,"packaging":"lyophilisat oral 500 mg","source_page":36}]',
    'The next catalog read reflects the vessel’s new choice';
  assert not exists(select 1 from jsonb_array_elements(requirements) r
    where r ? 'catalog_code' and r->>'dotation_key' <> 'dotation c restreinte'),
    'The old regulation and unchecked emergency bag are absent from the active catalog';
  assert (select count(*) = 2 from public.pharmacy_inventory where id in (base_lot, bag_lot)),
    'A setting change preserves existing onboard counts';
  assert not exists(select 1 from public.pharmacy_inventory_notifications() where item_id = bag_lot),
    'Unchecking the bag removes its alerts without deleting its stock';

  update public.vessels set medical_dotation = 'DOTATION A', max_people = 10 where id = assigned_vessel;
  requirements := public.list_pharmacy_dotation_requirements(assigned_vessel);
  assert requirements @> '[{"dotation_key":"dotation a","designation":"Furosémide","required_quantity":"10 pour 25 marins",
    "required_stock_quantity":null,"applicability":"variable"}]',
    'Maximum capacity does not substitute for crew habitually onboard the Dotation A vessel';
  assert requirements @> '[{"dotation_key":"dotation a","catalog_code":"E109","required_stock_quantity":null,"applicability":"not_applicable"}]',
    'A vessel with capacity for ten cannot reach the first-aid-kit threshold of eleven crew';
end;
$d217$;

rollback;
