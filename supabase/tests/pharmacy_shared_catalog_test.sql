-- Shared category structure, vessel-private stocks. Real roles and assignments only.
-- Synthetic fixtures are fully rolled back; source stock is never reimported.
begin;
do $shared_catalog$
declare
  c bigint; other_c bigint; vessel_a bigint; vessel_b bigint; empty_vessel bigint; b_vessel bigint; restricted_b_vessel bigint; other_vessel bigint;
  captain bigint; sailor bigint; med_id bigint; equipment_id bigint; empty_id bigint; alias_id bigint; legacy_id bigint := -9240001;
  b_id bigint; restricted_b_id bigint; other_id bigint; unclassified_id bigint; captain_id bigint;
  a_med bigint; a_retired bigint; a_equipment bigint; b_med bigint; b_retired bigint; b_equipment bigint;
  b_type_item bigint; restricted_b_item bigint; spoofed bigint; legacy_item bigint;
  uid uuid; role_name text; before_a jsonb; before_b jsonb; before_a_retired jsonb; before_b_retired jsonb;
  before_equipment jsonb; before_b_type jsonb; before_restricted_b jsonb; before_foreign jsonb;
  after_a jsonb; after_b jsonb; before_alerts jsonb; category_revision integer;
  c_label text := 'Dotation C restreinte';
  today date := (current_timestamp at time zone 'Europe/Paris')::date;
  draft jsonb := '{"designation":"SHARED CATALOG FIXTURE","section":"Original workbook section retained","brand":"Synthetic","lot_number":"CAT-LOT","quantity":"2 Boîtes","required_quantity":"4x5","expiry_precision":"unknown","notes":"Original source notes"}';
begin
  assert pharmacy_private.dotation_key(' C Restreint ')=pharmacy_private.dotation_key('Dotation C restreinte'), 'Known Fleet C restricted aliases share one type';
  assert pharmacy_private.dotation_key('Dotation B')<>pharmacy_private.dotation_key('B Restreint'), 'B and B restricted remain distinct types';
  assert pharmacy_private.dotation_key('Unknown clinical group')<>pharmacy_private.dotation_key('Dotation C restreinte'), 'Unknown labels never infer a regulatory type';
  assert not has_function_privilege('anon','public.save_pharmacy_category(bigint,text,bigint,integer,text,text)','EXECUTE'), 'Anonymous shared catalog writes are denied';
  assert not has_table_privilege('authenticated','public.pharmacy_category_catalog','UPDATE'), 'Shared catalog edits cannot bypass revision RPCs';
  assert not has_table_privilege('authenticated','pharmacy_private.pharmacy_category_legacy_ids','SELECT'), 'Legacy aliases remain private';
  assert not has_table_privilege('authenticated','pharmacy_private.pharmacy_category_vessel_archive','SELECT'), 'Archived vessel catalogs remain private';
  assert exists(select 1 from public.pharmacy_category_catalog where name='12. Médicaments hors dotation/spéciaux' and medical_section='equipment'), 'Goury A194 stays in the equipment branch dictated by its workbook position';

  insert into public.companies(code,name) values('pharmacy-shared-test','Pharmacy shared fixture') returning id into c;
  insert into public.companies(code,name) values('pharmacy-shared-other','Pharmacy shared other tenant') returning id into other_c;
  insert into public.vessels(company_id,name,acronym,active,asset_kind,medical_dotation)
    values(c,'CATALOG ASSIGNED','SCA',true,'vessel',c_label) returning id into vessel_a;
  insert into public.vessels(company_id,name,acronym,active,asset_kind,medical_dotation)
    values(c,'CATALOG C ALIAS','SCB',true,'vessel','C Restreint') returning id into vessel_b;
  insert into public.vessels(company_id,name,acronym,active,asset_kind,medical_dotation)
    values(c,'CATALOG EMPTY C','SCE',true,'vessel',c_label) returning id into empty_vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind,medical_dotation)
    values(c,'CATALOG B','SCU',true,'vessel','Dotation B') returning id into b_vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind,medical_dotation)
    values(c,'CATALOG B RESTRICTED','SCR',true,'vessel','B Restreint') returning id into restricted_b_vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind,medical_dotation)
    values(other_c,'CATALOG OTHER TENANT','SCO',true,'vessel',c_label) returning id into other_vessel;
  insert into public.role_module_permissions(role_key,module_key,is_visible)
    select key,'pharmacy',true from public.roles where key in ('admin','direction','armement','capitaine','marin')
    on conflict(role_key,module_key) do update set is_visible=true;
  for uid,role_name in select * from (values
    ('9e240000-0000-4000-8000-000000000001'::uuid,'admin'),
    ('9e240000-0000-4000-8000-000000000002'::uuid,'direction'),
    ('9e240000-0000-4000-8000-000000000003'::uuid,'armement'),
    ('9e240000-0000-4000-8000-000000000004'::uuid,'capitaine'),
    ('9e240000-0000-4000-8000-000000000005'::uuid,'marin')) fixture(id,role_key)
  loop
    insert into auth.users(id,email) values(uid,'pharmacy-shared-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(uid,'pharmacy-shared-'||role_name||'@example.invalid','Shared catalog '||role_name,c);
    insert into public.company_memberships(company_id,user_id,active) values(c,uid,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(uid,c,role_name);
  end loop;
  insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active)
    values(c,'9e240000-0000-4000-8000-000000000004','Shared','Captain','Capitaine','SC-CAP',true) returning id into captain;
  insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active)
    values(c,'9e240000-0000-4000-8000-000000000005','Shared','Sailor','Matelot','SC-MAR',true) returning id into sailor;
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status)
    values(c,vessel_a,captain,today-1,today+1,'Capitaine','confirmed'),(c,vessel_a,sailor,today-1,today+1,'Matelot','confirmed');
  insert into public.pharmacy_category_catalog(company_id,medical_dotation,medical_section,name)
    values(other_c,c_label,'medicines','Shared category') returning id into other_id;
  select to_jsonb(k) into before_foreign from public.pharmacy_category_catalog k where id=other_id;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','9e240000-0000-4000-8000-000000000001',true);
  med_id:=public.save_pharmacy_category(vessel_a,'Shared category',null,null,c_label,'medicines');
  equipment_id:=public.save_pharmacy_category(vessel_a,'Shared category',null,null,c_label,'equipment');
  empty_id:=public.save_pharmacy_category(vessel_a,'Empty shared category',null,null,c_label,'equipment');
  unclassified_id:=public.save_pharmacy_category(vessel_a,'Legacy unspecified branch');
  assert med_id<>equipment_id, 'The same category name is independent in Medicines and Equipment';
  assert (select count(*)=3 and count(distinct id)=1 from public.pharmacy_categories where id=empty_id and vessel_id in(vessel_a,vessel_b,empty_vessel)), 'An empty shared category projects the same canonical ID to all three C-alias vessels';
  assert not exists(select 1 from public.pharmacy_inventory where vessel_id in(vessel_a,vessel_b,empty_vessel)), 'Sharing a category does not invent or copy vessel stock';
  assert (select medical_section='unclassified' from public.pharmacy_categories where id=unclassified_id and vessel_id=vessel_a), 'Legacy category calls do not guess a medical branch from the category name';
  begin
    perform public.save_pharmacy_category(vessel_b,' shared CATEGORY ',null,null,'C Restreint','medicines');
    raise exception 'A second vessel created a duplicate shared category';
  exception when unique_violation then null; end;
  assert not exists(select 1 from public.pharmacy_categories where id=med_id and vessel_id=b_vessel), 'A different dotation does not receive the C catalog';
  assert not exists(select 1 from public.pharmacy_categories where id=other_id), 'Another company catalog is not visible';
  b_id:=public.save_pharmacy_category(b_vessel,'Shared category',null,null,'Dotation B','medicines');
  restricted_b_id:=public.save_pharmacy_category(restricted_b_vessel,'Shared category',null,null,'B Restreint','medicines');
  assert b_id<>restricted_b_id and b_id<>med_id, 'B, B restricted and C keep independent canonical categories';

  a_med:=public.save_pharmacy_item(vessel_a,draft||jsonb_build_object('category','Shared category','medical_section','medicines','expires_on',today+10,'expiry_precision','day'));
  a_retired:=public.save_pharmacy_item(vessel_a,draft||'{"designation":"RETIRED A","category":"Shared category","medical_section":"medicines","active":false}');
  a_equipment:=public.save_pharmacy_item(vessel_a,draft||'{"designation":"EQUIPMENT A","category":"Shared category","medical_section":"equipment"}');
  b_med:=public.save_pharmacy_item(vessel_b,draft||jsonb_build_object('designation','MEDICINE B','category','Shared category','medical_section','medicines','expires_on',today+20,'expiry_precision','day'));
  b_retired:=public.save_pharmacy_item(vessel_b,draft||'{"designation":"RETIRED B","category":"Shared category","medical_section":"medicines","active":false}');
  b_equipment:=public.save_pharmacy_item(vessel_b,draft||'{"designation":"EQUIPMENT B","category":"Shared category","medical_section":"equipment"}');
  b_type_item:=public.save_pharmacy_item(b_vessel,draft||'{"category":"Shared category","medical_section":"medicines"}');
  restricted_b_item:=public.save_pharmacy_item(restricted_b_vessel,draft||'{"category":"Shared category","medical_section":"medicines"}');
  assert (select category_id=med_id from public.pharmacy_inventory where id=a_med)
    and (select category_id=med_id from public.pharmacy_inventory where id=b_med), 'Different vessel stocks link to the same shared category without sharing their rows';
  assert (select quantity='2 Boîtes' and required_quantity='4x5' from public.pharmacy_inventory where id=b_med), 'Source quantity strings remain intact';
  spoofed:=public.save_pharmacy_item(vessel_a,draft||jsonb_build_object('designation','SPOOFED FOREIGN ID','category','Shared category','medical_section','medicines','category_id',other_id));
  assert (select company_id=c and category_id=med_id from public.pharmacy_inventory where id=spoofed), 'An untrusted foreign category_id does not override server text/parent/branch resolution';
  perform public.save_pharmacy_item(vessel_a,draft||jsonb_build_object('designation','SPOOFED OLD EQUIPMENT ID','category','Shared category','medical_section','medicines','category_id',equipment_id),spoofed,1);
  assert (select category_id=med_id and medical_section='medicines' from public.pharmacy_inventory where id=spoofed), 'A stale form category_id does not silently move an article to Equipment';
  legacy_item:=public.save_pharmacy_item(vessel_a,draft||'{"designation":"LEGACY SOURCE BRANCH","category":"Legacy inferred category","section":"DOTATION C RESTREINTE - MEDICAMENTS (catégorie 3 - 20 miles - 24h )"}');
  assert (select medical_section='medicines' from public.pharmacy_inventory where id=legacy_item), 'An explicit original medicines section supports legacy article compatibility';
  perform public.save_pharmacy_item(vessel_a,draft||'{"designation":"LEGACY SOURCE BRANCH","category":"Legacy inferred category","section":"Changed source free text"}',legacy_item,1);
  assert (select medical_section='medicines' from public.pharmacy_inventory where id=legacy_item), 'Legacy edits without the new branch field retain the existing classification';

  execute 'reset role';
  update public.pharmacy_inventory set source_file='synthetic-shared-catalog.xlsx',source_sheet='Original section',
    source_row=id::integer,source_data=jsonb_build_object('raw_quantity','2 Boîtes','raw_category','Shared category') where id in(a_med,a_retired,b_med,b_retired);
  select to_jsonb(i) into before_a from public.pharmacy_inventory i where id=a_med;
  select to_jsonb(i) into before_b from public.pharmacy_inventory i where id=b_med;
  select to_jsonb(i) into before_a_retired from public.pharmacy_inventory i where id=a_retired;
  select to_jsonb(i) into before_b_retired from public.pharmacy_inventory i where id=b_retired;
  select jsonb_agg(to_jsonb(i) order by i.id) into before_equipment from public.pharmacy_inventory i where id in(a_equipment,b_equipment);
  select to_jsonb(i) into before_b_type from public.pharmacy_inventory i where id=b_type_item;
  select to_jsonb(i) into before_restricted_b from public.pharmacy_inventory i where id=restricted_b_item;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','9e240000-0000-4000-8000-000000000001',true);
  select jsonb_agg(to_jsonb(n) order by n.id) into before_alerts from public.pharmacy_notifications() n where n.vessel_id in(vessel_a,vessel_b);
  assert jsonb_array_length(before_alerts)=2, 'Vessel stocks independently emit their two expiry alarms';

  perform set_config('request.jwt.claim.sub','9e240000-0000-4000-8000-000000000004',true);
  assert exists(select 1 from public.pharmacy_categories where id=empty_id and vessel_id=vessel_a), 'Assigned captain sees the shared catalog through their own vessel';
  assert not exists(select 1 from public.pharmacy_categories where vessel_id=vessel_b or vessel_id=empty_vessel), 'Shared catalog does not expose another vessel context to the captain';
  assert not exists(select 1 from public.pharmacy_inventory where vessel_id=vessel_b), 'The captain cannot read the other vessel stock';
  assert public.save_pharmacy_category(vessel_a,'Shared renamed',med_id,1,c_label,'medicines')=med_id, 'Assigned captain may rename a shared structure through an authorized vessel';
  assert (select category='Shared renamed' and revision=(before_a->>'revision')::integer+1 from public.pharmacy_inventory where id=a_med), 'Captain rename updates their own linked article';
  begin
    perform public.save_pharmacy_category(vessel_b,'Unauthorized vessel route',med_id,2,'C Restreint','medicines');
    raise exception 'Captain used an unassigned vessel as the shared-edit authorization route';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_pharmacy_category(vessel_a,'Moved branch',med_id,2,c_label,'equipment');
    raise exception 'Category changed its medical branch through rename';
  exception when serialization_failure then null; end;
  begin
    perform public.save_pharmacy_category(vessel_a,'Moved type',med_id,2,'Dotation B','medicines');
    raise exception 'Category changed its dotation through rename';
  exception when serialization_failure then null; end;

  execute 'reset role';
  select to_jsonb(i) into after_a from public.pharmacy_inventory i where id=a_med;
  select to_jsonb(i) into after_b from public.pharmacy_inventory i where id=b_med;
  assert after_b->>'category'='Shared renamed' and (after_b->>'revision')::integer=(before_b->>'revision')::integer+1, 'Shared rename reaches the other vessel without exposing its stock to the captain';
  assert (after_a-array['category','category_id','revision','updated_at','updated_by'])=(before_a-array['category','category_id','revision','updated_at','updated_by'])
    and (after_b-array['category','category_id','revision','updated_at','updated_by'])=(before_b-array['category','category_id','revision','updated_at','updated_by']), 'Shared rename preserves every vessel quantity, date, lot, source section, snapshot and provenance';
  assert (select category='Shared renamed' and revision=(before_a_retired->>'revision')::integer+1 from public.pharmacy_inventory where id=a_retired)
    and (select category='Shared renamed' and revision=(before_b_retired->>'revision')::integer+1 from public.pharmacy_inventory where id=b_retired), 'Shared rename includes retired articles on both vessels';
  assert (select jsonb_agg(to_jsonb(i) order by i.id)=before_equipment from public.pharmacy_inventory i where id in(a_equipment,b_equipment)), 'Medicines rename leaves the identically named Equipment category and stocks untouched';
  assert (select to_jsonb(i)=before_b_type from public.pharmacy_inventory i where id=b_type_item)
    and (select to_jsonb(i)=before_restricted_b from public.pharmacy_inventory i where id=restricted_b_item), 'Other dotation types remain untouched';
  assert (select to_jsonb(k)=before_foreign from public.pharmacy_category_catalog k where id=other_id), 'Other company catalog remains untouched';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','9e240000-0000-4000-8000-000000000002',true);
  assert (select count(*)=3 and bool_and(name='Shared renamed' and revision=2) from public.pharmacy_categories where id=med_id and vessel_id in(vessel_a,vessel_b,empty_vessel)), 'Direction sees one updated canonical category consistently across all matching vessels';
  assert (select jsonb_agg(to_jsonb(n) order by n.id)=before_alerts from public.pharmacy_notifications() n where n.vessel_id in(vessel_a,vessel_b)), 'Shared rename preserves all vessel expiry alarms';
  begin
    perform public.save_pharmacy_item(vessel_b,before_b,b_med,(before_b->>'revision')::integer);
    raise exception 'A stale editor on the second vessel reverted the shared rename';
  exception when serialization_failure then null; end;
  begin
    perform public.save_pharmacy_category(vessel_b,'Stale shared editor',med_id,1,'C Restreint','medicines');
    raise exception 'A stale category editor on another vessel overwrote the shared revision';
  exception when serialization_failure then null; end;

  -- Legacy numeric aliases resolve to a canonical ID but never rescue stale cached revisions.
  alias_id:=public.save_pharmacy_category(vessel_a,'Legacy alias target',null,null,c_label,'equipment');
  perform public.save_pharmacy_category(vessel_a,'Legacy alias refreshed',alias_id,1,c_label,'equipment');
  execute 'reset role';
  insert into pharmacy_private.pharmacy_category_legacy_ids(legacy_id,vessel_id,company_id,category_id)
    values(legacy_id,vessel_a,c,alias_id);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','9e240000-0000-4000-8000-000000000002',true);
  begin
    perform public.save_pharmacy_category(vessel_a,'Cached legacy lost update',legacy_id,1,c_label,'equipment');
    raise exception 'A cached legacy category revision was accepted after canonical migration';
  exception when serialization_failure then null; end;
  assert public.save_pharmacy_category(vessel_a,'Legacy alias resolved',legacy_id,2,c_label,'equipment')=alias_id, 'A refreshed legacy alias resolves to the canonical shared category';
  assert (select revision=3 and name='Legacy alias resolved' from public.pharmacy_categories where id=alias_id and vessel_id=vessel_a), 'Alias writes update the canonical revision, never an archived row';

  perform set_config('request.jwt.claim.sub','9e240000-0000-4000-8000-000000000003',true);
  begin
    perform public.delete_pharmacy_category(vessel_a,legacy_id,2);
    raise exception 'A stale legacy alias deleted the canonical category';
  exception when serialization_failure then null; end;
  begin
    perform public.delete_pharmacy_category(vessel_b,legacy_id,3);
    raise exception 'A legacy vessel alias granted authority through another vessel context';
  exception when insufficient_privilege then null; end;
  perform public.delete_pharmacy_category(vessel_a,legacy_id,3);
  assert not exists(select 1 from public.pharmacy_categories where id=alias_id), 'Deletion through a refreshed vessel alias removes its canonical category';
  perform public.delete_pharmacy_category(vessel_b,med_id,2);
  assert not exists(select 1 from public.pharmacy_categories where id=med_id), 'Armement deletes the shared category from every matching vessel projection';
  assert (select count(*)=4 and bool_and(category='' and category_id is null) from public.pharmacy_inventory where id in(a_med,a_retired,b_med,b_retired)), 'Deleting a shared category clears classification on every linked active/retired article without deleting stock';
  assert (select to_jsonb(i)-array['category','category_id','revision','updated_at','updated_by']=before_a-array['category','category_id','revision','updated_at','updated_by'] from public.pharmacy_inventory i where id=a_med)
    and (select to_jsonb(i)-array['category','category_id','revision','updated_at','updated_by']=before_b-array['category','category_id','revision','updated_at','updated_by'] from public.pharmacy_inventory i where id=b_med), 'Shared deletion preserves source data and vessel-specific stock values';
  assert (select jsonb_agg(to_jsonb(i) order by i.id)=before_equipment from public.pharmacy_inventory i where id in(a_equipment,b_equipment)), 'Shared Medicines deletion preserves Equipment stocks';
  assert (select jsonb_agg(to_jsonb(n) order by n.id)=before_alerts from public.pharmacy_notifications() n where n.vessel_id in(vessel_a,vessel_b)), 'Shared deletion preserves expiry alarms on all vessels';
  assert not exists(select 1 from public.pharmacy_inventory where vessel_id=empty_vessel), 'The empty vessel still has no invented stock after shared rename/delete';

  perform set_config('request.jwt.claim.sub','9e240000-0000-4000-8000-000000000005',true);
  assert exists(select 1 from public.pharmacy_categories where id=empty_id and vessel_id=vessel_a), 'A real Marin reads the common empty catalog through their own vessel';
  assert not exists(select 1 from public.pharmacy_inventory where vessel_id=vessel_b)
    and not exists(select 1 from public.pharmacy_categories where vessel_id=vessel_b), 'Marin never gains other vessel context or stock from catalog sharing';
  begin
    perform public.save_pharmacy_category(vessel_a,'Marin write',empty_id,1,c_label,'equipment');
    raise exception 'Marin changed a shared category';
  exception when insufficient_privilege then null; end;
  begin
    perform public.delete_pharmacy_category(vessel_a,empty_id,1);
    raise exception 'Marin deleted a shared category';
  exception when insufficient_privilege then null; end;

  execute 'reset role';
  update public.vessels set medical_dotation='Dotation B' where id=empty_vessel;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','9e240000-0000-4000-8000-000000000001',true);
  assert not exists(select 1 from public.pharmacy_categories where id=empty_id and vessel_id=empty_vessel), 'A newly shared empty category does not invent a historical vessel assignment after Fleet changes';
  assert exists(select 1 from public.pharmacy_categories where id=b_id and vessel_id=empty_vessel), 'The empty vessel now receives the shared B catalog for its current assignment';
  begin
    perform public.save_pharmacy_category(other_vessel,'Cross-company edit',other_id,1,c_label,'medicines');
    raise exception 'Another company category was modified';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('pharmacy_shared_test.company',c::text,true);
  perform set_config('pharmacy_shared_test.vessel',vessel_a::text,true);
  perform set_config('pharmacy_shared_test.category',empty_id::text,true);
  perform set_config('request.jwt.claim.sub','9e240000-0000-4000-8000-000000000004',true);
end $shared_catalog$;

-- Authorization helpers must see the changed state in a fresh SQL command.
update public.company_memberships set active=false where company_id=current_setting('pharmacy_shared_test.company')::bigint
  and user_id='9e240000-0000-4000-8000-000000000004';
set local role authenticated;
do $revoked$
declare vessel bigint:=current_setting('pharmacy_shared_test.vessel')::bigint;
  category_id bigint:=current_setting('pharmacy_shared_test.category')::bigint;
begin
  assert not exists(select 1 from public.pharmacy_categories where vessel_id=vessel), 'Revoked membership removes shared catalog projections';
  begin
    perform public.save_pharmacy_category(vessel,'Revoked shared edit',category_id,1,'Dotation C restreinte','equipment');
    raise exception 'Revoked membership edited the shared catalog';
  exception when insufficient_privilege then null; end;
end $revoked$;
reset role;
update public.company_memberships set active=true where company_id=current_setting('pharmacy_shared_test.company')::bigint
  and user_id='9e240000-0000-4000-8000-000000000004';
update public.role_module_permissions set is_visible=false where role_key='capitaine' and module_key='pharmacy';
set local role authenticated;
do $hidden$
declare vessel bigint:=current_setting('pharmacy_shared_test.vessel')::bigint;
  category_id bigint:=current_setting('pharmacy_shared_test.category')::bigint;
begin
  assert not exists(select 1 from public.pharmacy_categories where vessel_id=vessel), 'Hidden module removes shared catalog reads';
  begin
    perform public.delete_pharmacy_category(vessel,category_id,1);
    raise exception 'Hidden module deleted a shared category';
  exception when insufficient_privilege then null; end;
end $hidden$;
reset role;
rollback;
