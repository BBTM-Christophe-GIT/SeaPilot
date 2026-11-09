-- Same-type dotation definitions, independent vessel stocks and real role scopes.
begin;

do $shared_requirements$
declare
  c bigint; foreign_c bigint; vessel_a bigint; vessel_b bigint; vessel_c bigint; empty_vessel bigint; foreign_vessel bigint;
  lot_a bigint; lot_b bigint; lot_new bigint; lot_equipment bigint; lot_other_type bigint; lot_foreign bigint;
  lot_outside bigint; lot_retired bigint; lot_legacy bigint; lot_incomparable bigint; lot_direct_volume bigint;
  actor record; person bigint; revision_b integer; original_b jsonb;
  today date := (current_timestamp at time zone 'Europe/Paris')::date;
  definition jsonb := '{"designation":"Sérum  partagé","medical_section":"medicines","required_quantity":"20","required_stock_quantity":20,"required_stock_unit":"ampoule","required_strength":"5 mL","required_package_size":10,"update_dotation_requirement":true,"dotation_requirement_revision":null}';
  common_key jsonb := '{"dotation_key":"dotation c restreinte","medical_section":"medicines","designation_key":"serum partage"}';
begin
  assert not has_table_privilege('authenticated','pharmacy_private.dotation_requirements','SELECT'), 'Catalog reads go through the guarded vessel RPC';
  assert not has_table_privilege('authenticated','pharmacy_private.dotation_requirements','UPDATE'), 'Catalog writes go through the authorized inventory RPC';
  assert not has_function_privilege('anon','public.list_pharmacy_dotation_requirements(bigint)','EXECUTE'), 'Anonymous users cannot list targets';

  insert into public.companies(code,name) values('pharmacy-target-test','Pharmacy target fixture') returning id into c;
  insert into public.companies(code,name) values('pharmacy-target-other','Foreign target fixture') returning id into foreign_c;
  insert into public.vessels(company_id,name,active,asset_kind,medical_dotation)
    values(c,'TARGET VESSEL A',true,'vessel','Dotation C restreinte') returning id into vessel_a;
  insert into public.vessels(company_id,name,active,asset_kind,medical_dotation)
    values(c,'TARGET VESSEL B',true,'vessel','C Restreint') returning id into vessel_b;
  insert into public.vessels(company_id,name,active,asset_kind,medical_dotation)
    values(c,'TARGET OTHER TYPE',true,'vessel','Dotation B') returning id into vessel_c;
  insert into public.vessels(company_id,name,active,asset_kind,medical_dotation)
    values(c,'TARGET EMPTY VESSEL',true,'vessel','Dotation C restreinte') returning id into empty_vessel;
  insert into public.vessels(company_id,name,active,asset_kind,medical_dotation)
    values(foreign_c,'TARGET FOREIGN VESSEL',true,'vessel','Dotation C restreinte') returning id into foreign_vessel;
  insert into public.role_module_permissions(role_key,module_key,is_visible)
    select key,'pharmacy',true from public.roles where key in ('admin','capitaine','marin')
    on conflict(role_key,module_key) do update set is_visible=true;

  for actor in select * from (values
    ('b75c0000-0000-4000-8000-000000000001'::uuid,'admin'),
    ('b75c0000-0000-4000-8000-000000000002'::uuid,'capitaine'),
    ('b75c0000-0000-4000-8000-000000000003'::uuid,'marin')) fixture(id,role_key)
  loop
    insert into auth.users(id,email) values(actor.id,'pharmacy-target-'||actor.role_key||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id)
      values(actor.id,'pharmacy-target-'||actor.role_key||'@example.invalid','Target '||actor.role_key,c);
    insert into public.company_memberships(company_id,user_id,active) values(c,actor.id,true)
      on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor.id,c,actor.role_key);
    if actor.role_key <> 'admin' then
      insert into public.people(company_id,user_id,first_name,last_name,active)
        values(c,actor.id,'Target',actor.role_key,true) returning id into person;
      insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status)
        values(c,vessel_a,person,today-1,today+1,actor.role_key,'confirmed');
    end if;
  end loop;

  insert into public.pharmacy_inventory(company_id,vessel_id,medical_dotation,medical_section,designation,required_quantity)
    values(foreign_c,foreign_vessel,'C Restreint','medicines','Serum partage','88') returning id into lot_foreign;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','b75c0000-0000-4000-8000-000000000001',true);
  lot_b:=public.save_pharmacy_item(vessel_b,jsonb_build_object(
    'designation',' SERUM partage ','medical_section','medicines','stock_quantity',18,'required_quantity','25',
    'stock_unit','flacon','strength','5 mL','package_size',3,'lot_number','LOT B','notes','Vessel B notes',
    'expires_on',today+100,'expiry_precision','day'));
  select to_jsonb(i) into original_b from public.pharmacy_inventory i where id=lot_b;
  lot_equipment:=public.save_pharmacy_item(vessel_b,'{"designation":"Serum partage","medical_section":"equipment","required_quantity":"7"}');
  lot_other_type:=public.save_pharmacy_item(vessel_c,'{"designation":"Serum partage","medical_section":"medicines","required_quantity":"8"}');
  lot_outside:=public.save_pharmacy_item(vessel_b,'{"designation":"Serum partage","medical_section":"medicines","outside_dotation":true,"quantity":"1","required_quantity":"99"}');
  lot_retired:=public.save_pharmacy_item(vessel_b,'{"designation":"Serum partage","medical_section":"medicines","active":false,"required_quantity":"12"}');

  lot_a:=public.save_pharmacy_item(vessel_a,definition||'{"stock_quantity":10,"stock_unit":"flacon","strength":"10 mL","package_size":2}');
  assert (select required_stock_quantity=20 and required_stock_unit='ampoule' and required_strength='5 mL'
    and required_package_size=10 and revision=2 from public.pharmacy_inventory where id=lot_b), 'One common target reaches another vessel with an equivalent Fleet type';
  assert (select to_jsonb(i)-array['required_quantity','required_stock_quantity','required_stock_unit','required_strength','required_package_size','revision','updated_at','updated_by']
    = original_b-array['required_quantity','required_stock_quantity','required_stock_unit','required_strength','required_package_size','revision','updated_at','updated_by']
    from public.pharmacy_inventory i where id=lot_b), 'Sharing a target changes no lot, onboard stock, expiry, source or notes';
  assert (select count(*)=3 from public.pharmacy_inventory where (id,required_quantity) in ((lot_equipment,'7'),(lot_other_type,'8'),(lot_outside,'99'))),
    'Branches, other types and outside-dotation inventory stay independent';
  assert (select required_quantity='12' from public.pharmacy_inventory where id=lot_retired), 'A shared edit leaves a retired lot intact';
  assert not exists(select 1 from public.pharmacy_inventory_notifications() where item_id in (lot_a,lot_outside)), '10 × 10 mL meets 20 × 5 mL and Hors dotation has no stock alert';
  assert exists(select 1 from public.pharmacy_inventory_notifications() where item_id=lot_b and kind='stock'), '18 × 5 mL is insufficient for 20 × 5 mL';
  assert public.list_pharmacy_dotation_requirements(empty_vessel) @> jsonb_build_array(common_key||'{"designation":"Sérum  partagé","required_stock_quantity":20,"dotation_requirement_revision":1}'),
    'The form can find a common target even before a vessel has matching inventory';
  assert public.list_pharmacy_dotation_requirements(vessel_c) = '[]'::jsonb, 'Catalog lookup is scoped to the vessel dotation';
  assert not exists(select 1 from public.pharmacy_inventory where vessel_id=empty_vessel), 'Sharing a target does not invent stock rows';

  lot_new:=public.save_pharmacy_item(vessel_b,'{"designation":"Sérum partagé","medical_section":"medicines","stock_quantity":4,"stock_unit":"flacon","strength":"2,5 cL"}');
  assert (select required_stock_quantity=20 and required_strength='5 mL' from public.pharmacy_inventory where id=lot_new), 'A later lot automatically inherits the common target';
  assert not exists(select 1 from public.pharmacy_inventory_notifications() where item_id=lot_new), '4 × 2.5 cL also meets 20 × 5 mL';
  perform public.save_pharmacy_item(vessel_b,(select to_jsonb(i)||'{"active":true}' from public.pharmacy_inventory i where id=lot_retired),lot_retired,1);
  assert (select required_stock_quantity=20 from public.pharmacy_inventory where id=lot_retired), 'Reactivating a lot applies the current common target';

  begin
    perform public.save_pharmacy_item(vessel_b,definition||'{"stock_quantity":1,"required_stock_quantity":30}',lot_b,2);
    raise exception 'A stale catalog create overwrote the common definition';
  exception when serialization_failure then null; end;
  assert (select stock_quantity=18 and required_stock_quantity=20 and revision=2 from public.pharmacy_inventory where id=lot_b), 'A target conflict rolls back the individual stock edit';
  perform public.save_pharmacy_item(vessel_b,(select to_jsonb(i)||'{"stock_quantity":19,"required_stock_quantity":99,"update_dotation_requirement":false}'
    from public.pharmacy_inventory i where id=lot_b),lot_b,2);
  assert (select stock_quantity=19 and required_stock_quantity=20 and revision=3 from public.pharmacy_inventory where id=lot_b), 'A stock-only edit retains the canonical target';
  begin
    perform public.save_pharmacy_item(vessel_b,(select to_jsonb(i)||'{"required_stock_quantity":null}' from public.pharmacy_inventory i where id=lot_b),lot_b,3);
    raise exception 'An old client silently discarded a real change to a shared target';
  exception when serialization_failure then null; end;
  perform public.save_pharmacy_item(vessel_b,(select to_jsonb(i)||'{"notes":"Legacy stock edit"}' from public.pharmacy_inventory i where id=lot_b),lot_b,3);
  assert (select notes='Legacy stock edit' and required_stock_quantity=20 and revision=4 from public.pharmacy_inventory where id=lot_b),
    'Old clients can still save stock-only changes';

  lot_legacy:=public.save_pharmacy_item(vessel_a,'{"designation":"Legacy volume","quantity":"10 x 10ml","required_quantity":"20 x 5ml"}');
  assert not exists(select 1 from public.pharmacy_inventory_notifications() where item_id=lot_legacy), 'Textual legacy volume equivalence survives the new stock check';
  perform public.save_pharmacy_item(vessel_a,'{"designation":"Legacy volume","quantity":"9 x 10ml","required_quantity":"20 x 5ml"}',lot_legacy,1);
  assert exists(select 1 from public.pharmacy_inventory_notifications() where item_id=lot_legacy and kind='stock'), 'Textual legacy volume shortage is detected';
  lot_incomparable:=public.save_pharmacy_item(vessel_a,'{"designation":"Different strengths","stock_quantity":1,"stock_unit":"comprimé","strength":"300 mg","required_stock_quantity":20,"required_stock_unit":"comprimé","required_strength":"500 mg"}');
  assert not exists(select 1 from public.pharmacy_inventory_notifications() where item_id=lot_incomparable), 'Different mass strengths do not imply clinical equivalence or a stock shortage';
  lot_direct_volume:=public.save_pharmacy_item(vessel_a,'{"designation":"Direct volume","stock_quantity":0.1,"stock_unit":"litre","required_stock_quantity":20,"required_stock_unit":"ampoule","required_strength":"5 mL"}');
  assert not exists(select 1 from public.pharmacy_inventory_notifications() where item_id=lot_direct_volume), 'A direct volume may meet a counted volume target';
  perform public.save_pharmacy_item(vessel_a,'{"designation":"Direct volume","stock_quantity":90,"stock_unit":"mL","required_quantity":"20 x 5ml","required_stock_quantity":null,"required_stock_unit":null,"required_strength":null}',lot_direct_volume,1);
  assert exists(select 1 from public.pharmacy_inventory_notifications() where item_id=lot_direct_volume and kind='stock'), 'A legacy target with volume per unit does not inherit the onboard mL unit';
  perform public.save_pharmacy_item(vessel_a,'{"designation":"Direct volume","quantity":"1900ml","stock_quantity":null,"stock_unit":null,"required_quantity":"2 x 1 litre"}',lot_direct_volume,2);
  assert exists(select 1 from public.pharmacy_inventory_notifications() where item_id=lot_direct_volume and kind='stock'), 'Compact direct volumes and legacy litres are comparable';

  perform set_config('request.jwt.claim.sub','b75c0000-0000-4000-8000-000000000002',true);
  assert public.list_pharmacy_dotation_requirements(vessel_a) @> jsonb_build_array(common_key), 'Assigned captain can look up the common target';
  assert not exists(select 1 from public.pharmacy_inventory where id=lot_b), 'Shared targets do not widen a captain’s stock access';
  begin
    perform public.list_pharmacy_dotation_requirements(vessel_b);
    raise exception 'Captain listed dotations through an unassigned vessel';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_pharmacy_item(vessel_b,definition,lot_b,4);
    raise exception 'Captain wrote inventory through an unassigned vessel';
  exception when insufficient_privilege then null; end;
  perform public.save_pharmacy_item(vessel_a,(select to_jsonb(i)||'{"required_quantity":"24","required_stock_quantity":24,"update_dotation_requirement":true,"dotation_requirement_revision":1}'
    from public.pharmacy_inventory i where id=lot_a),lot_a,1);
  assert public.list_pharmacy_dotation_requirements(vessel_a) @> jsonb_build_array(common_key||'{"required_stock_quantity":24,"dotation_requirement_revision":2}'),
    'A captain editing an assigned vessel can manage its common dotation';

  perform set_config('request.jwt.claim.sub','b75c0000-0000-4000-8000-000000000003',true);
  assert public.list_pharmacy_dotation_requirements(vessel_a) @> jsonb_build_array(common_key), 'An assigned sailor can read common dotation with pharmacy access';
  begin
    perform public.save_pharmacy_item(vessel_a,definition,lot_a,2);
    raise exception 'A sailor edited a shared target';
  exception when insufficient_privilege then null; end;

  execute 'reset role';
  assert (select required_stock_quantity=24 and stock_quantity=19 and revision=5 from public.pharmacy_inventory where id=lot_b),
    'A captain’s common edit updates the shared target without changing another vessel’s stock';
  assert (select required_quantity='88' and required_stock_quantity is null from public.pharmacy_inventory where id=lot_foreign), 'Common targets never cross company boundaries';
end $shared_requirements$;

rollback;
