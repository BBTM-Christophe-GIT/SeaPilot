-- Real authenticated profiles and current planning assignments, never simulated views.
-- Synthetic companies, people, inventory and metadata are fully rolled back. No upload occurs.
begin;
do $test$
declare
  c bigint; other_c bigint; vessel bigint; unassigned bigint; other_vessel bigint;
  captain bigint; sailor bigint; category_id bigint; empty_id bigint; duplicate_id bigint;
  other_category_id bigint; captain_category_id bigint; max_id bigint;
  active_item bigint; retired_item bigint; unaffected_item bigint; other_item bigint; control_id bigint;
  uid uuid; role_name text; bad_name text; before_active jsonb; before_retired jsonb; before_unaffected jsonb;
  after_active jsonb; after_retired jsonb; before_category jsonb; alerts_before jsonb;
  today date := (current_timestamp at time zone 'Europe/Paris')::date;
  draft jsonb := '{"designation":"CATEGORY FIXTURE","section":"Medical chest","brand":"Synthetic","lot_number":"LOT-FIXTURE","quantity":"2 Boîtes","required_quantity":"4x5","expiry_precision":"unknown","notes":"Source text preserved"}';
begin
  -- The migration's seed preserves imported article text while covering every existing category.
  assert not exists (
    select 1 from public.pharmacy_inventory i
    where btrim(i.category) <> '' and not exists (
      select 1 from public.pharmacy_categories k where k.company_id=i.company_id and k.vessel_id=i.vessel_id
        and lower(btrim(k.name))=lower(btrim(i.category))
    )
  ), 'Every pre-existing nonempty category has a catalog entry, including inactive articles';
  assert (select relrowsecurity from pg_class where oid='public.pharmacy_categories'::regclass), 'Category RLS is enabled';
  assert not has_table_privilege('anon','public.pharmacy_categories','SELECT'), 'Anonymous category reads are denied';
  assert has_table_privilege('authenticated','public.pharmacy_categories','SELECT'), 'Authenticated category reads use RLS';
  assert not has_table_privilege('authenticated','public.pharmacy_categories','INSERT'), 'Direct category insertion is denied';
  assert not has_table_privilege('authenticated','public.pharmacy_categories','UPDATE'), 'Direct category updates cannot bypass CAS';
  assert not has_table_privilege('authenticated','public.pharmacy_categories','DELETE'), 'Direct category deletion cannot bypass RPC rules';
  assert not has_function_privilege('anon','public.save_pharmacy_category(bigint,text,bigint,integer,text)','EXECUTE'), 'Anonymous category writes are denied';
  assert not has_function_privilege('anon','public.delete_pharmacy_category(bigint,bigint,integer)','EXECUTE'), 'Anonymous category deletion is denied';

  insert into public.companies(code,name) values('pharmacy-cat-test','Pharmacy categories fixture') returning id into c;
  insert into public.companies(code,name) values('pharmacy-cat-other','Pharmacy categories other tenant') returning id into other_c;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'CATEGORY ASSIGNED','PCA',true,'vessel') returning id into vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'CATEGORY UNASSIGNED','PCU',true,'vessel') returning id into unassigned;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(other_c,'CATEGORY OTHER COMPANY','PCO',true,'vessel') returning id into other_vessel;
  -- Do not depend on the operator's current menu settings; these fixture permissions roll back too.
  insert into public.role_module_permissions(role_key,module_key,is_visible)
    select key,'pharmacy',true from public.roles where key in ('admin','direction','armement','capitaine','marin')
    on conflict(role_key,module_key) do update set is_visible=true;
  for uid,role_name in select * from (values
    ('9e220000-0000-4000-8000-000000000001'::uuid,'admin'),
    ('9e220000-0000-4000-8000-000000000002'::uuid,'direction'),
    ('9e220000-0000-4000-8000-000000000003'::uuid,'armement'),
    ('9e220000-0000-4000-8000-000000000004'::uuid,'capitaine'),
    ('9e220000-0000-4000-8000-000000000005'::uuid,'marin')) fixture(id,role_key)
  loop
    insert into auth.users(id,email) values(uid,'pharmacy-cat-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(uid,'pharmacy-cat-'||role_name||'@example.invalid','Pharmacy category '||role_name,c);
    insert into public.company_memberships(company_id,user_id,active) values(c,uid,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(uid,c,role_name);
  end loop;
  insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active)
    values(c,'9e220000-0000-4000-8000-000000000004','Category','Captain','Capitaine','PC-CAP',true) returning id into captain;
  insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active)
    values(c,'9e220000-0000-4000-8000-000000000005','Category','Sailor','Matelot','PC-MAR',true) returning id into sailor;
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status)
    values(c,vessel,captain,today-1,today+1,'Capitaine','confirmed'),(c,vessel,sailor,today-1,today+1,'Matelot','confirmed');
  insert into public.pharmacy_categories(company_id,vessel_id,name) values(other_c,other_vessel,'Other tenant') returning id into other_category_id;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','9e220000-0000-4000-8000-000000000001',true);
  empty_id := public.save_pharmacy_category(vessel,'  Empty category  ');
  select to_jsonb(k) into before_category from public.pharmacy_categories k where id=empty_id;
  assert before_category->>'name'='Empty category', 'New category names are trimmed';
  assert (before_category->>'revision')::integer=1, 'New category starts at revision one';
  assert (before_category->>'company_id')::bigint=c and (before_category->>'vessel_id')::bigint=vessel, 'New category belongs to the authorized vessel/company';
  assert (before_category->>'created_by')::uuid=auth.uid() and (before_category->>'updated_by')::uuid=auth.uid(), 'Creation records the real authenticated author';
  assert not exists(select 1 from public.pharmacy_inventory where vessel_id=vessel), 'An empty category persists without inventing articles';
  begin
    perform public.save_pharmacy_category(vessel,'  empty CATEGORY  ');
    raise exception 'Case-insensitive duplicate category accepted';
  exception when unique_violation then null; end;
  assert (select count(*) from public.pharmacy_categories where vessel_id=vessel)=1, 'Rejected duplicate does not create another category';
  for bad_name in select unnest(array[null::text,'','   ',repeat('x',201)]) loop
    begin
      perform public.save_pharmacy_category(vessel,bad_name);
      raise exception 'Invalid category name accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  max_id := public.save_pharmacy_category(vessel,repeat('x',200));
  assert (select length(name)=200 from public.pharmacy_categories where id=max_id), 'The maximum 200-character name is accepted';

  category_id := public.save_pharmacy_category(vessel,'Cardiologie');
  duplicate_id := public.save_pharmacy_category(vessel,'Other category');
  active_item := public.save_pharmacy_item(vessel,draft||jsonb_build_object('category','  CARDIOLOGIE  ','expires_on',today+10,'expiry_precision','day','expiry_text','source expiry'));
  retired_item := public.save_pharmacy_item(vessel,draft||'{"designation":"RETIRED CATEGORY FIXTURE","category":"Cardiologie","active":false}');
  unaffected_item := public.save_pharmacy_item(vessel,draft||'{"designation":"UNRELATED CATEGORY FIXTURE","category":"Other category"}');
  other_item := public.save_pharmacy_item(unassigned,draft||'{"designation":"OTHER VESSEL FIXTURE","category":"Cardiologie"}');
  assert (select category='Cardiologie' from public.pharmacy_inventory where id=active_item), 'Article saves resolve case/space variants to the existing canonical category';
  assert (select count(*)=1 from public.pharmacy_categories where vessel_id=vessel and lower(name)='cardiologie'), 'Article save reuses the existing catalog entry';
  assert exists(select 1 from public.pharmacy_categories where vessel_id=unassigned and name='Cardiologie'), 'A freeform article category is automatically registered for its own vessel';
  assert not exists(select 1 from public.pharmacy_categories where id=other_category_id), 'A category in another company is hidden by RLS';
  begin
    perform public.save_pharmacy_category(other_vessel,'Cross-company creation');
    raise exception 'Cross-company category creation accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_pharmacy_category(vessel,'Cross-company rename',other_category_id,1);
    raise exception 'Cross-company category identifier accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.delete_pharmacy_category(vessel,other_category_id,1);
    raise exception 'Cross-company category deletion accepted';
  exception when insufficient_privilege then null; end;

  -- Attach synthetic workbook provenance and an expiry control without storing any actual file.
  execute 'reset role';
  update public.pharmacy_inventory set source_file='synthetic-categories.xlsx',source_sheet='Medical chest',source_row=case when id=active_item then 101 else 102 end,
    source_data=jsonb_build_object('source_category','Cardiologie','source_quantity','2 Boîtes','raw_expiry','source expiry') where id in(active_item,retired_item);
  insert into public.pharmacy_controls(company_id,vessel_id,expires_on,storage_path,file_name,file_size,mime_type,revision,created_by)
    values(c,vessel,today+15,c||'/'||vessel||'/9e220000-0000-4000-8000-000000000099.pdf','Synthetic control fixture.pdf',100,'application/pdf',1,'9e220000-0000-4000-8000-000000000001') returning id into control_id;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','9e220000-0000-4000-8000-000000000002',true);
  select to_jsonb(i) into before_active from public.pharmacy_inventory i where id=active_item;
  select to_jsonb(i) into before_retired from public.pharmacy_inventory i where id=retired_item;
  select to_jsonb(i) into before_unaffected from public.pharmacy_inventory i where id=unaffected_item;
  select to_jsonb(k) into before_category from public.pharmacy_categories k where id=category_id;
  select jsonb_agg(to_jsonb(n) order by n.id) into alerts_before from public.pharmacy_notifications() n where n.vessel_id=vessel;
  assert jsonb_array_length(alerts_before)=2, 'Fixture has one article alarm and one control alarm';
  begin
    perform public.save_pharmacy_category(vessel,' OTHER CATEGORY ',category_id,1);
    raise exception 'Rename into another category accepted';
  exception when unique_violation then null; end;
  assert (select to_jsonb(k)=before_category from public.pharmacy_categories k where id=category_id), 'Conflicting rename leaves category metadata unchanged';
  assert (select to_jsonb(i)=before_active from public.pharmacy_inventory i where id=active_item), 'Conflicting rename leaves articles unchanged';
  assert public.save_pharmacy_category(vessel,'  Renamed cardiology  ',category_id,1)=category_id, 'Direction renames an existing category atomically';
  select to_jsonb(i) into after_active from public.pharmacy_inventory i where id=active_item;
  select to_jsonb(i) into after_retired from public.pharmacy_inventory i where id=retired_item;
  assert after_active->>'category'='Renamed cardiology' and after_retired->>'category'='Renamed cardiology', 'Rename updates active and inactive articles';
  assert (after_active->>'revision')::integer=(before_active->>'revision')::integer+1
    and (after_retired->>'revision')::integer=(before_retired->>'revision')::integer+1, 'Rename invalidates both stale article revisions';
  assert (after_active-array['category','revision','updated_at','updated_by'])=(before_active-array['category','revision','updated_at','updated_by'])
    and (after_retired-array['category','revision','updated_at','updated_by'])=(before_retired-array['category','revision','updated_at','updated_by']), 'Rename preserves every other value, active status and workbook provenance';
  assert (after_active->>'updated_by')::uuid=auth.uid() and (after_retired->>'updated_by')::uuid=auth.uid(), 'Article rename audit identifies Direction';
  assert (after_active->>'updated_at')::timestamptz>(before_active->>'updated_at')::timestamptz, 'Article rename records a fresh audit timestamp';
  assert (select name='Renamed cardiology' and revision=2 and updated_by=auth.uid() and created_by=(before_category->>'created_by')::uuid from public.pharmacy_categories where id=category_id), 'Category revision/audit update preserves its original creator';
  assert (select to_jsonb(i)=before_unaffected from public.pharmacy_inventory i where id=unaffected_item), 'Rename does not touch other categories';
  assert (select category='Cardiologie' and revision=1 from public.pharmacy_inventory where id=other_item), 'Rename does not touch the same name on another vessel';
  assert (select jsonb_agg(to_jsonb(n) order by n.id)=alerts_before from public.pharmacy_notifications() n where n.vessel_id=vessel), 'Rename does not remove or alter expiry/control alerts';
  begin
    perform public.save_pharmacy_item(vessel,before_active,active_item,(before_active->>'revision')::integer);
    raise exception 'Stale article overwrote a category rename';
  exception when serialization_failure then null; end;
  begin
    perform public.save_pharmacy_category(vessel,'Lost update',category_id,1);
    raise exception 'Stale category rename accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.delete_pharmacy_category(vessel,category_id,1);
    raise exception 'Stale category deletion accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.save_pharmacy_category(vessel,'No revision',category_id,null);
    raise exception 'Revisionless category update accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.delete_pharmacy_category(vessel,category_id,null);
    raise exception 'Revisionless category deletion accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.save_pharmacy_category(unassigned,'Wrong vessel',category_id,2);
    raise exception 'Category moved to another vessel';
  exception when insufficient_privilege then null; end;
  begin
    perform public.delete_pharmacy_category(unassigned,category_id,2);
    raise exception 'Category deleted through another vessel';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_pharmacy_category(vessel,'Missing category',-9220001,1);
    raise exception 'Nonexistent category update accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.delete_pharmacy_category(vessel,-9220001,1);
    raise exception 'Nonexistent category deletion accepted';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub','9e220000-0000-4000-8000-000000000003',true);
  before_active := after_active; before_retired := after_retired;
  perform public.delete_pharmacy_category(vessel,category_id,2);
  assert not exists(select 1 from public.pharmacy_categories where id=category_id), 'Armement removes the catalog entry';
  select to_jsonb(i) into after_active from public.pharmacy_inventory i where id=active_item;
  select to_jsonb(i) into after_retired from public.pharmacy_inventory i where id=retired_item;
  assert after_active is not null and after_retired is not null and after_active->>'category'='' and after_retired->>'category'='', 'Category deletion retains both articles without a category';
  assert (after_active->>'revision')::integer=(before_active->>'revision')::integer+1
    and (after_retired->>'revision')::integer=(before_retired->>'revision')::integer+1, 'Deletion invalidates stale article editors';
  assert (after_active-array['category','revision','updated_at','updated_by'])=(before_active-array['category','revision','updated_at','updated_by'])
    and (after_retired-array['category','revision','updated_at','updated_by'])=(before_retired-array['category','revision','updated_at','updated_by']), 'Category deletion preserves quantities, dates, lots, activity and source provenance';
  assert (after_active->>'updated_by')::uuid=auth.uid() and (after_retired->>'updated_by')::uuid=auth.uid(), 'Deletion records Armement as article editor';
  assert exists(select 1 from public.pharmacy_controls where id=control_id and is_current), 'Category deletion does not remove the current control';
  assert (select jsonb_agg(to_jsonb(n) order by n.id)=alerts_before from public.pharmacy_notifications() n where n.vessel_id=vessel), 'Category deletion preserves all expiry/control alerts';
  begin
    perform public.save_pharmacy_item(vessel,before_active,active_item,(before_active->>'revision')::integer);
    raise exception 'Stale article resurrected a deleted category';
  exception when serialization_failure then null; end;
  assert not exists(select 1 from public.pharmacy_categories where vessel_id=vessel and name='Renamed cardiology'), 'Rejected stale article cannot recreate the deleted category';
  perform public.delete_pharmacy_category(vessel,empty_id,1);
  assert not exists(select 1 from public.pharmacy_categories where id=empty_id), 'An empty category can be removed without articles';
  empty_id := public.save_pharmacy_category(vessel,'Empty category');
  assert exists(select 1 from public.pharmacy_categories where id=empty_id and revision=1), 'A removed name can be created again as a new category';

  perform set_config('request.jwt.claim.sub','9e220000-0000-4000-8000-000000000004',true);
  assert exists(select 1 from public.pharmacy_categories where id=empty_id), 'The real assigned captain reads persistent empty categories';
  captain_category_id := public.save_pharmacy_category(vessel,'Captain category');
  perform public.save_pharmacy_category(vessel,'Captain renamed',captain_category_id,1);
  perform public.delete_pharmacy_category(vessel,captain_category_id,2);
  assert not exists(select 1 from public.pharmacy_categories where id=captain_category_id), 'The real assigned captain can create, rename and delete categories';
  assert not exists(select 1 from public.pharmacy_categories where vessel_id=unassigned), 'The captain cannot read another vessel catalog';
  begin
    perform public.save_pharmacy_category(unassigned,'Forbidden captain category');
    raise exception 'Captain created a category on an unassigned vessel';
  exception when insufficient_privilege then null; end;
  begin
    perform public.delete_pharmacy_category(unassigned,(select id from public.pharmacy_categories where vessel_id=unassigned limit 1),1);
    raise exception 'Captain deleted a category on an unassigned vessel';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub','9e220000-0000-4000-8000-000000000005',true);
  assert exists(select 1 from public.pharmacy_categories where id=empty_id), 'The real onboard Marin reads empty categories';
  assert not exists(select 1 from public.pharmacy_categories where vessel_id=unassigned or vessel_id=other_vessel), 'Marin category scope excludes other vessels/companies';
  begin
    perform public.save_pharmacy_category(vessel,'Forbidden Marin category');
    raise exception 'Marin created a category';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_pharmacy_category(vessel,'Forbidden Marin rename',empty_id,1);
    raise exception 'Marin renamed a category';
  exception when insufficient_privilege then null; end;
  begin
    perform public.delete_pharmacy_category(vessel,empty_id,1);
    raise exception 'Marin deleted a category';
  exception when insufficient_privilege then null; end;

  -- Save fixture IDs for new-command access checks below (stable helpers see the new state).
  execute 'reset role';
  perform set_config('pharmacy_categories_test.company',c::text,true);
  perform set_config('pharmacy_categories_test.vessel',vessel::text,true);
  perform set_config('pharmacy_categories_test.captain',captain::text,true);
  perform set_config('pharmacy_categories_test.category',empty_id::text,true);
  perform set_config('request.jwt.claim.sub','9e220000-0000-4000-8000-000000000004',true);
end $test$;

-- A hidden module blocks both category reads and RPCs for a genuinely assigned captain.
update public.role_module_permissions set is_visible=false where role_key='capitaine' and module_key='pharmacy';
set local role authenticated;
do $hidden_module$
declare vessel bigint:=current_setting('pharmacy_categories_test.vessel')::bigint;
  category_id bigint:=current_setting('pharmacy_categories_test.category')::bigint;
begin
  assert not exists(select 1 from public.pharmacy_categories where vessel_id=vessel), 'A hidden module removes direct category reads';
  begin
    perform public.save_pharmacy_category(vessel,'Hidden module category');
    raise exception 'Hidden module created a category';
  exception when insufficient_privilege then null; end;
  begin
    perform public.delete_pharmacy_category(vessel,category_id,1);
    raise exception 'Hidden module deleted a category';
  exception when insufficient_privilege then null; end;
end $hidden_module$;
reset role;
update public.role_module_permissions set is_visible=true where role_key='capitaine' and module_key='pharmacy';
update public.company_memberships set active=false where company_id=current_setting('pharmacy_categories_test.company')::bigint
  and user_id='9e220000-0000-4000-8000-000000000004';
set local role authenticated;
do $revoked_membership$
declare vessel bigint:=current_setting('pharmacy_categories_test.vessel')::bigint;
  category_id bigint:=current_setting('pharmacy_categories_test.category')::bigint;
begin
  assert not exists(select 1 from public.pharmacy_categories where vessel_id=vessel), 'Revoked company membership removes category reads';
  begin
    perform public.save_pharmacy_category(vessel,'Revoked membership category');
    raise exception 'Revoked company membership created a category';
  exception when insufficient_privilege then null; end;
  begin
    perform public.delete_pharmacy_category(vessel,category_id,1);
    raise exception 'Revoked company membership deleted a category';
  exception when insufficient_privilege then null; end;
end $revoked_membership$;
reset role;
update public.company_memberships set active=true where company_id=current_setting('pharmacy_categories_test.company')::bigint
  and user_id='9e220000-0000-4000-8000-000000000004';
update public.planning_assignments set confirmation_status='cancelled'
  where vessel_id=current_setting('pharmacy_categories_test.vessel')::bigint and crew_person_id=current_setting('pharmacy_categories_test.captain')::bigint;
update public.planning_vessel_permissions set revoked_at=clock_timestamp()
  where vessel_id=current_setting('pharmacy_categories_test.vessel')::bigint and user_id='9e220000-0000-4000-8000-000000000004'
    and action_key='read' and revoked_at is null;
set local role authenticated;
do $cancelled_assignment$
declare vessel bigint:=current_setting('pharmacy_categories_test.vessel')::bigint;
begin
  assert not exists(select 1 from public.pharmacy_categories where vessel_id=vessel), 'Cancelled assignment removes captain catalog visibility';
  begin
    perform public.save_pharmacy_category(vessel,'Cancelled assignment category');
    raise exception 'Unassigned captain created a category';
  exception when insufficient_privilege then null; end;
end $cancelled_assignment$;
reset role;
rollback;
