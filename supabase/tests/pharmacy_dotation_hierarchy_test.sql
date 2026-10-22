-- Actual roles and planning assignments, with synthetic vessel/company fixtures only.
-- Every change rolls back. No file upload or live medical record is modified.
begin;
do $hierarchy$
declare
  c bigint; other_c bigint; vessel bigint; unassigned bigint; other_vessel bigint;
  captain bigint; sailor bigint; b_category bigint; c_category bigint; empty_b bigint;
  article_only_category bigint; catalog_only_category bigint; other_category bigint; captain_category bigint;
  b_item bigint; b_retired bigint; c_item bigint; article_only bigint; control_id bigint;
  uid uuid; role_name text;
  b_label text := 'Dotation B restreinte'; c_label text := 'Dotation C';
  today date := (current_timestamp at time zone 'Europe/Paris')::date;
  before_b jsonb; before_retired jsonb; before_c jsonb; after_b jsonb; after_retired jsonb;
  before_b_category jsonb; before_c_category jsonb; alerts_before jsonb;
  draft jsonb := '{"designation":"DOTATION FIXTURE","section":"Original workbook section, never inferred","brand":"Synthetic","lot_number":"LOT-DOTATION","quantity":"2 Boîtes","required_quantity":"4x5","expiry_text":"source expiry","notes":"Original source notes"}';
begin
  assert not has_function_privilege('anon','public.save_pharmacy_category(bigint,text,bigint,integer,text,text)','EXECUTE'), 'Anonymous users cannot call the hierarchy-aware category RPC';
  assert not has_table_privilege('authenticated','public.pharmacy_categories','UPDATE'), 'Snapshot changes cannot bypass revision RPCs';
  assert not has_table_privilege('authenticated','public.pharmacy_inventory','UPDATE'), 'Article snapshots cannot be reassigned directly';

  insert into public.companies(code,name) values('pharmacy-dot-test','Pharmacy dotation fixture') returning id into c;
  insert into public.companies(code,name) values('pharmacy-dot-other','Pharmacy dotation other tenant') returning id into other_c;
  insert into public.vessels(company_id,name,acronym,active,asset_kind,medical_dotation)
    values(c,'DOTATION ASSIGNED','PDA',true,'vessel',b_label) returning id into vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind,medical_dotation)
    values(c,'DOTATION UNASSIGNED','PDU',true,'vessel','Other vessel only') returning id into unassigned;
  insert into public.vessels(company_id,name,acronym,active,asset_kind,medical_dotation)
    values(other_c,'DOTATION OTHER TENANT','PDO',true,'vessel','Other tenant only') returning id into other_vessel;
  insert into public.role_module_permissions(role_key,module_key,is_visible)
    select key,'pharmacy',true from public.roles where key in ('admin','direction','armement','capitaine','marin')
    on conflict(role_key,module_key) do update set is_visible=true;
  for uid,role_name in select * from (values
    ('9e230000-0000-4000-8000-000000000001'::uuid,'admin'),
    ('9e230000-0000-4000-8000-000000000002'::uuid,'direction'),
    ('9e230000-0000-4000-8000-000000000003'::uuid,'armement'),
    ('9e230000-0000-4000-8000-000000000004'::uuid,'capitaine'),
    ('9e230000-0000-4000-8000-000000000005'::uuid,'marin')) fixture(id,role_key)
  loop
    insert into auth.users(id,email) values(uid,'pharmacy-dot-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(uid,'pharmacy-dot-'||role_name||'@example.invalid','Pharmacy dotation '||role_name,c);
    insert into public.company_memberships(company_id,user_id,active) values(c,uid,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(uid,c,role_name);
  end loop;
  insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active)
    values(c,'9e230000-0000-4000-8000-000000000004','Dotation','Captain','Capitaine','PD-CAP',true) returning id into captain;
  insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active)
    values(c,'9e230000-0000-4000-8000-000000000005','Dotation','Sailor','Matelot','PD-MAR',true) returning id into sailor;
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status)
    values(c,vessel,captain,today-1,today+1,'Capitaine','confirmed'),(c,vessel,sailor,today-1,today+1,'Matelot','confirmed');
  insert into public.pharmacy_category_catalog(company_id,name,medical_dotation,medical_section)
    values(other_c,'Other tenant category','Other tenant only','unclassified') returning id into other_category;
  insert into public.pharmacy_category_catalog(company_id,name,medical_dotation,medical_section)
    values(c,'Other vessel category','Other vessel only','unclassified');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','9e230000-0000-4000-8000-000000000001',true);
  assert (select medical_dotation=b_label from public.pharmacy_available_vessels() where id=vessel), 'Vessel RPC exposes the authoritative current medical dotation';
  b_category := public.save_pharmacy_category(vessel,'Cardiology');
  empty_b := public.save_pharmacy_category(vessel,'Empty historical category');
  b_item := public.save_pharmacy_item(vessel,draft||jsonb_build_object('category','  CARDIOLOGY  ','expires_on',today+10,'expiry_precision','day'));
  b_retired := public.save_pharmacy_item(vessel,draft||jsonb_build_object('designation','RETIRED B FIXTURE','category','Cardiology','active',false,'expiry_precision','unknown'));
  assert (select medical_dotation=b_label from public.pharmacy_categories where id=b_category), 'A legacy category call snapshots the current dotation';
  assert (select medical_dotation=b_label and category='Cardiology' from public.pharmacy_inventory where id=b_item), 'A legacy article call snapshots the current parent and canonicalizes its category';
  assert (select section=draft->>'section' from public.pharmacy_inventory where id=b_item), 'The original source section is not interpreted as a medical dotation';
  begin
    perform public.save_pharmacy_category(vessel,'  cardiology  ',null,null,b_label);
    raise exception 'Duplicate category within the same parent accepted';
  exception when unique_violation then null; end;
  begin
    perform public.save_pharmacy_category(vessel,'Invalid new parent',null,null,'Unrecorded dotation');
    raise exception 'Arbitrary medical dotation accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.save_pharmacy_category(vessel,'Foreign vessel parent',null,null,'Other vessel only');
    raise exception 'Another vessel parent broadened the available hierarchy';
  exception when serialization_failure then null; end;
  begin
    perform public.save_pharmacy_category(vessel,'Foreign tenant parent',null,null,'Other tenant only');
    raise exception 'Another company parent broadened the available hierarchy';
  exception when serialization_failure then null; end;
  begin
    perform public.save_pharmacy_category(other_vessel,'Forbidden tenant write',null,null,'Other tenant only');
    raise exception 'Cross-company category creation accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_pharmacy_category(vessel,'Forbidden foreign identifier',other_category,1,b_label);
    raise exception 'Foreign category identifier accepted';
  exception when insufficient_privilege then null; end;

  execute 'reset role';
  update public.pharmacy_inventory set source_file='synthetic-dotation.xlsx',source_sheet='Original section',
    source_row=case when id=b_item then 201 else 202 end,
    source_data=jsonb_build_object('source_category','Cardiology','source_quantity','2 Boîtes','section',draft->>'section') where id in(b_item,b_retired);
  -- One historical parent exists only on an article; another exists only as an empty catalog group.
  insert into public.pharmacy_inventory(company_id,vessel_id,designation,medical_dotation,category,section,active)
    values(c,vessel,'ARTICLE-ONLY HISTORY','Legacy article parent','',draft->>'section',false) returning id into article_only;
  insert into pharmacy_private.pharmacy_category_vessel_archive(company_id,vessel_id,name,medical_dotation)
    values(c,vessel,'Existing empty legacy group','Legacy catalog parent');
  insert into public.pharmacy_category_catalog(company_id,name,medical_dotation,medical_section)
    values(c,'Existing empty legacy group','Legacy catalog parent','unclassified');
  insert into public.pharmacy_controls(company_id,vessel_id,expires_on,storage_path,file_name,file_size,mime_type,revision,created_by)
    values(c,vessel,today+15,c||'/'||vessel||'/9e230000-0000-4000-8000-000000000099.pdf','Synthetic dotation control.pdf',100,'application/pdf',1,'9e230000-0000-4000-8000-000000000001') returning id into control_id;
  select to_jsonb(i) into before_b from public.pharmacy_inventory i where id=b_item;
  select to_jsonb(i) into before_retired from public.pharmacy_inventory i where id=b_retired;
  select to_jsonb(k) into before_b_category from public.pharmacy_categories k where id=b_category;
  -- This is the authoritative Fleet field on the synthetic vessel. It must not rewrite past inventories.
  update public.vessels set medical_dotation=c_label where id=vessel;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','9e230000-0000-4000-8000-000000000001',true);
  assert (select medical_dotation=c_label from public.pharmacy_available_vessels() where id=vessel), 'Fleet reassignment is visible to the vessel RPC';
  assert (select to_jsonb(i)=before_b from public.pharmacy_inventory i where id=b_item)
    and (select to_jsonb(i)=before_retired from public.pharmacy_inventory i where id=b_retired), 'Fleet reassignment does not relabel or otherwise mutate historical active/inactive articles';
  assert (select to_jsonb(k)=before_b_category from public.pharmacy_categories k where id=b_category), 'Fleet reassignment preserves historical categories and revisions';
  c_category := public.save_pharmacy_category(vessel,'Cardiology');
  c_item := public.save_pharmacy_item(vessel,draft||jsonb_build_object('designation','CURRENT C FIXTURE','category','cardiology','expires_on',today+20,'expiry_precision','day'));
  assert (select medical_dotation=c_label from public.pharmacy_categories where id=c_category), 'New categories use the reassigned Fleet parent';
  assert b_category<>c_category and (select count(*)=2 from public.pharmacy_categories where vessel_id=vessel and lower(name)='cardiology'), 'The same category name coexists under B and C';
  assert (select medical_dotation=c_label and category='Cardiology' from public.pharmacy_inventory where id=c_item), 'New articles resolve their category only in the current C parent';
  article_only_category := public.save_pharmacy_category(vessel,'History from article',null,null,'Legacy article parent');
  catalog_only_category := public.save_pharmacy_category(vessel,'History from catalog',null,null,'Legacy catalog parent');
  assert exists(select 1 from public.pharmacy_categories where id=article_only_category and medical_dotation='Legacy article parent'), 'An article-only historical parent remains available for category management';
  assert exists(select 1 from public.pharmacy_categories where id=catalog_only_category and medical_dotation='Legacy catalog parent'), 'A catalog-only historical parent remains available for category management';
  assert public.save_pharmacy_category(vessel,'New empty B category',null,null,b_label) is not null, 'A historical B parent accepts another empty category after Fleet changed to C';
  begin
    perform public.save_pharmacy_item(vessel,draft||jsonb_build_object('category','Forbidden historical article','medical_dotation',b_label,'expiry_precision','unknown'));
    raise exception 'A new article selected the historical dotation instead of the current Fleet parent';
  exception when serialization_failure then null; end;
  assert not exists(select 1 from public.pharmacy_categories where vessel_id=vessel and name='Forbidden historical article'), 'Rejected historical article does not leave an auto-registered category';
  begin
    perform public.save_pharmacy_item(vessel,draft||jsonb_build_object('category','Stale new draft','medical_dotation',b_label,'expiry_precision','unknown'));
    raise exception 'A draft opened under B silently switched to C';
  exception when serialization_failure then null; end;

  -- Older clients omit the new field when saving an existing article: preserve its snapshot.
  perform public.save_pharmacy_item(vessel,(before_b-'medical_dotation')||'{"notes":"Edited after Fleet reassignment"}',b_item,(before_b->>'revision')::integer);
  assert (select medical_dotation=b_label and revision=2 from public.pharmacy_inventory where id=b_item), 'An old-client edit preserves the historical B snapshot after Fleet changed to C';
  select to_jsonb(i) into before_b from public.pharmacy_inventory i where id=b_item;
  begin
    perform public.save_pharmacy_item(vessel,before_b||jsonb_build_object('medical_dotation',c_label),b_item,(before_b->>'revision')::integer);
    raise exception 'An existing article moved between dotation parents';
  exception when serialization_failure then null; end;
  assert (select to_jsonb(i)=before_b from public.pharmacy_inventory i where id=b_item), 'Rejected article movement leaves all values/revisions unchanged';
  select to_jsonb(i) into before_c from public.pharmacy_inventory i where id=c_item;
  select to_jsonb(k) into before_c_category from public.pharmacy_categories k where id=c_category;
  select jsonb_agg(to_jsonb(n) order by n.id) into alerts_before from public.pharmacy_notifications() n where n.vessel_id=vessel;
  assert jsonb_array_length(alerts_before)=3, 'Fixture has B/C article expiry alarms and the independent control alarm';

  perform set_config('request.jwt.claim.sub','9e230000-0000-4000-8000-000000000002',true);
  begin
    perform public.save_pharmacy_category(vessel,'Wrong parent rename',b_category,1,c_label);
    raise exception 'Category rename accepted a different expected parent';
  exception when serialization_failure then null; end;
  assert (select to_jsonb(k)=before_b_category from public.pharmacy_categories k where id=b_category), 'Wrong expected parent does not update the category';
  assert public.save_pharmacy_category(vessel,'Renamed B cardiology',b_category,1,'  DOTATION B RESTREINTE  ')=b_category, 'Direction can rename a historical category using its case-insensitive stored parent';
  select to_jsonb(i) into after_b from public.pharmacy_inventory i where id=b_item;
  select to_jsonb(i) into after_retired from public.pharmacy_inventory i where id=b_retired;
  assert after_b->>'category'='Renamed B cardiology' and after_retired->>'category'='Renamed B cardiology', 'Historical rename updates B active and inactive articles';
  assert after_b->>'medical_dotation'=b_label and after_retired->>'medical_dotation'=b_label, 'Category rename cannot rewrite medical dotation snapshots';
  assert (after_b->>'revision')::integer=(before_b->>'revision')::integer+1
    and (after_retired->>'revision')::integer=(before_retired->>'revision')::integer+1, 'Historical rename invalidates both article editor revisions';
  assert (after_b-array['category','revision','updated_at','updated_by'])=(before_b-array['category','revision','updated_at','updated_by'])
    and (after_retired-array['category','revision','updated_at','updated_by'])=(before_retired-array['category','revision','updated_at','updated_by']), 'Rename preserves source sections, quantities, dates, lots, activity and provenance';
  assert (after_b->>'updated_by')::uuid=auth.uid(), 'Historical rename audits the real Direction account';
  assert (select to_jsonb(i)=before_c from public.pharmacy_inventory i where id=c_item), 'Renaming B does not touch the same category name under C';
  assert (select to_jsonb(k)=before_c_category from public.pharmacy_categories k where id=c_category), 'Renaming B preserves the separate C catalog entry';
  assert (select medical_dotation=b_label and revision=2 from public.pharmacy_categories where id=b_category), 'The category retains its original B parent';
  assert (select jsonb_agg(to_jsonb(n) order by n.id)=alerts_before from public.pharmacy_notifications() n where n.vessel_id=vessel), 'Parent-scoped rename preserves every expiry/control alert';
  begin
    perform public.save_pharmacy_item(vessel,before_b,b_item,(before_b->>'revision')::integer);
    raise exception 'Stale B article overwrote a hierarchy rename';
  exception when serialization_failure then null; end;
  begin
    perform public.save_pharmacy_category(vessel,'Stale category editor',b_category,1,b_label);
    raise exception 'Stale category hierarchy revision accepted';
  exception when serialization_failure then null; end;

  perform set_config('request.jwt.claim.sub','9e230000-0000-4000-8000-000000000003',true);
  before_b:=after_b; before_retired:=after_retired;
  perform public.delete_pharmacy_category(vessel,b_category,2);
  select to_jsonb(i) into after_b from public.pharmacy_inventory i where id=b_item;
  select to_jsonb(i) into after_retired from public.pharmacy_inventory i where id=b_retired;
  assert not exists(select 1 from public.pharmacy_categories where id=b_category), 'Armement removes only the historical B catalog entry';
  assert after_b is not null and after_retired is not null and after_b->>'category'='' and after_retired->>'category'='', 'Deleting a historical group keeps B articles under B without a category';
  assert (after_b-array['category','category_id','revision','updated_at','updated_by'])=(before_b-array['category','category_id','revision','updated_at','updated_by'])
    and (after_retired-array['category','category_id','revision','updated_at','updated_by'])=(before_retired-array['category','category_id','revision','updated_at','updated_by']), 'Deleting a group preserves its parent, medical/source values and provenance';
  assert after_b->'category_id'='null'::jsonb and after_retired->'category_id'='null'::jsonb, 'Historical group deletion clears the canonical link without moving the article';
  assert (select to_jsonb(i)=before_c from public.pharmacy_inventory i where id=c_item)
    and (select to_jsonb(k)=before_c_category from public.pharmacy_categories k where id=c_category), 'Deleting B leaves C articles and their category completely unchanged';
  assert exists(select 1 from public.pharmacy_inventory where id=article_only and medical_dotation='Legacy article parent'), 'Other historical parents remain untouched';
  assert exists(select 1 from public.pharmacy_controls where id=control_id and is_current), 'Hierarchy actions never remove the current pharmacy control';
  assert (select jsonb_agg(to_jsonb(n) order by n.id)=alerts_before from public.pharmacy_notifications() n where n.vessel_id=vessel), 'Parent-scoped deletion preserves all article and control alarms';
  begin
    perform public.save_pharmacy_item(vessel,before_b,b_item,(before_b->>'revision')::integer);
    raise exception 'Stale article resurrected a deleted historical category';
  exception when serialization_failure then null; end;

  perform set_config('request.jwt.claim.sub','9e230000-0000-4000-8000-000000000004',true);
  assert exists(select 1 from public.pharmacy_categories where id=empty_b and medical_dotation=b_label)
    and exists(select 1 from public.pharmacy_categories where id=c_category and medical_dotation=c_label), 'A real assigned captain sees current and historical dotation groups';
  captain_category:=public.save_pharmacy_category(vessel,'Captain C group');
  assert (select medical_dotation=c_label from public.pharmacy_categories where id=captain_category), 'Captain additions use the current Fleet dotation';
  perform public.save_pharmacy_category(vessel,'Captain C renamed',captain_category,1,c_label);
  perform public.delete_pharmacy_category(vessel,captain_category,2);
  begin
    perform public.save_pharmacy_category(unassigned,'Forbidden captain parent',null,null,'Other vessel only');
    raise exception 'Captain edited an unassigned vessel hierarchy';
  exception when insufficient_privilege then null; end;
  assert not exists(select 1 from public.pharmacy_categories where vessel_id=unassigned or vessel_id=other_vessel), 'Captain hierarchy reads exclude unassigned vessels and other companies';
  perform set_config('request.jwt.claim.sub','9e230000-0000-4000-8000-000000000005',true);
  assert exists(select 1 from public.pharmacy_categories where id=empty_b and medical_dotation=b_label)
    and exists(select 1 from public.pharmacy_inventory where id=c_item and medical_dotation=c_label), 'A real onboard Marin reads both hierarchy levels';
  begin
    perform public.save_pharmacy_category(vessel,'Forbidden Marin hierarchy',null,null,b_label);
    raise exception 'Marin changed a historical hierarchy';
  exception when insufficient_privilege then null; end;
  begin
    perform public.delete_pharmacy_category(vessel,c_category,1);
    raise exception 'Marin removed a hierarchy category';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_pharmacy_item(vessel,draft||jsonb_build_object('medical_dotation',c_label,'expiry_precision','unknown'));
    raise exception 'Marin added an article in a hierarchy';
  exception when insufficient_privilege then null; end;

  execute 'reset role';
  perform set_config('pharmacy_dotation_test.company',c::text,true);
  perform set_config('pharmacy_dotation_test.vessel',vessel::text,true);
  perform set_config('pharmacy_dotation_test.category',c_category::text,true);
  perform set_config('request.jwt.claim.sub','9e230000-0000-4000-8000-000000000004',true);
end $hierarchy$;

-- Independent commands ensure stable authorization helpers see the changed membership/settings.
update public.company_memberships set active=false where company_id=current_setting('pharmacy_dotation_test.company')::bigint
  and user_id='9e230000-0000-4000-8000-000000000004';
set local role authenticated;
do $revoked$
declare vessel bigint:=current_setting('pharmacy_dotation_test.vessel')::bigint;
begin
  assert not exists(select 1 from public.pharmacy_categories where vessel_id=vessel), 'Revoked membership hides every hierarchy parent';
  assert not exists(select 1 from public.pharmacy_inventory where vessel_id=vessel), 'Revoked membership hides historical snapshots as well';
  begin
    perform public.save_pharmacy_category(vessel,'Revoked captain hierarchy',null,null,'Dotation C');
    raise exception 'Revoked captain changed the hierarchy';
  exception when insufficient_privilege then null; end;
end $revoked$;
reset role;
update public.company_memberships set active=true where company_id=current_setting('pharmacy_dotation_test.company')::bigint
  and user_id='9e230000-0000-4000-8000-000000000004';
update public.role_module_permissions set is_visible=false where role_key='capitaine' and module_key='pharmacy';
set local role authenticated;
do $hidden$
declare vessel bigint:=current_setting('pharmacy_dotation_test.vessel')::bigint;
  category_id bigint:=current_setting('pharmacy_dotation_test.category')::bigint;
begin
  assert not exists(select 1 from public.pharmacy_categories where vessel_id=vessel), 'A hidden module hides the hierarchy catalog';
  begin
    perform public.save_pharmacy_category(vessel,'Hidden module hierarchy',null,null,'Dotation C');
    raise exception 'Hidden module changed the hierarchy';
  exception when insufficient_privilege then null; end;
  begin
    perform public.delete_pharmacy_category(vessel,category_id,1);
    raise exception 'Hidden module removed a hierarchy category';
  exception when insufficient_privilege then null; end;
end $hidden$;
reset role;
rollback;
