-- Real Marin and Capitaine accounts, immutable releases and revocable feeds.
-- All data and token capabilities are rolled back; no raw token is printed.
begin;
select no_plan();

insert into public.companies(code, name) values ('calendar-status-fixture', 'Calendar status fixture');
insert into auth.users(id, email) values
  ('86200000-0000-0000-0000-000000000001', 'calendar-status-marin@example.invalid'),
  ('86200000-0000-0000-0000-000000000002', 'calendar-status-captain@example.invalid');
insert into public.profiles(id, email, display_name, active_company_id)
select account.id, account.email, 'SECRET ACCOUNT NAME', company.id
from auth.users account cross join public.companies company
where account.id::text like '86200000-%' and company.code = 'calendar-status-fixture';
insert into public.user_roles(user_id, company_id, role_key)
select id, active_company_id, case when id::text like '%001' then 'marin' else 'capitaine' end
from public.profiles where id::text like '86200000-%';
insert into public.people(company_id, user_id, first_name, last_name, active)
select active_company_id, id, 'SECRET', 'PERSON NAME', true
from public.profiles where id::text like '86200000-%';

do $$ begin
  perform set_config('test.calendar_status.company', (select id::text from public.companies where code = 'calendar-status-fixture'), true);
end $$;

insert into public.planning_releases(company_id, version_number, snapshot, published_by, published_by_name)
select current_setting('test.calendar_status.company')::bigint, 1,
  jsonb_build_object('scope', jsonb_build_object('company_id', current_setting('test.calendar_status.company')::bigint),
    'assignments', (select jsonb_agg(jsonb_build_object('id', person.id, 'crew_person_id', person.id,
      'starts_on', '2039-01-01', 'ends_on', '2039-01-14', 'status_label', 'En Mer',
      'vessel_name', case when person.user_id::text like '%001' then 'MARIN VESSEL' else 'CAPTAIN VESSEL' end,
      'crew_name', 'SECRET CREW NAME', 'comments', 'SECRET ASSIGNMENT NOTE'))
      from public.people person where person.company_id = current_setting('test.calendar_status.company')::bigint),
    'days', (select jsonb_agg(jsonb_build_object('id', person.id * 100 + fixture.day_number,
      'person_id', person.id, 'work_date', date '2039-01-01' + fixture.day_number - 1,
      'sailor_status', fixture.status_label, 'source_label', 'seapilot-assignment-note',
      'slot365', 'assignment:' || person.id, 'comments', 'SECRET DIAGNOSIS AND REASON',
      'vessel_name', 'SECRET MEDICAL PLACE'))
      from public.people person cross join (values
        (1, 'En Mer'), (2, 'A Terre'), (3, 'Extra'), (4, 'Repos'), (5, 'Vacance'),
        (6, 'Congés Paternités'), (7, 'Arrêt Maladie'), (8, 'Accident du Travail'),
        (9, 'Arrêt de travail'), (10, 'Formation'), (11, 'RTT'),
        (12, ' RÉPOS '), (13, 'Débarqué'), (14, 'SECRET CUSTOM STATUS')
      ) fixture(day_number, status_label)
      where person.company_id = current_setting('test.calendar_status.company')::bigint)),
  '86200000-0000-0000-0000-000000000001', 'SECRET PUBLISHER';

set local role authenticated;
do $$ declare actor uuid; calendar jsonb; subscription jsonb; begin
  foreach actor in array array['86200000-0000-0000-0000-000000000001'::uuid, '86200000-0000-0000-0000-000000000002'::uuid] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    calendar := public.personal_planning_calendar();
    subscription := public.create_planning_calendar_subscription();
    perform set_config('test.calendar_status.calendar.actor' || right(actor::text, 1), calendar::text, true);
    perform set_config('test.calendar_status.token.actor' || right(actor::text, 1), subscription->>'token', true);
  end loop;
end $$;
reset role;

select is((select count(*)::integer from private.planning_calendar_subscriptions subscription
  join public.people person on person.id = subscription.person_id and person.company_id = subscription.company_id
    and person.user_id = subscription.user_id
  where subscription.user_id in ('86200000-0000-0000-0000-000000000001', '86200000-0000-0000-0000-000000000002')),
  2, 'each token created by a real account is bound to that authenticated user and their own linked person');

set local role authenticated;
select set_config('request.jwt.claim.sub', '86200000-0000-0000-0000-000000000002', true);
select is(public.personal_planning_calendar(), current_setting('test.calendar_status.calendar.actor2')::jsonb,
  'the current authenticated Capitaine always exports their own account rather than the other selected Marin');
select throws_ok('select public.create_planning_calendar_subscription(''86200000-0000-0000-0000-000000000001''::uuid)',
  '42883', null, 'the creation RPC does not accept another user identifier');
select throws_ok('select public.personal_planning_calendar(null::uuid, null::bigint, null::bigint)',
  '42883', null, 'the authenticated export does not accept user, company or person selectors');
select throws_ok('select public.planning_calendar_feed(encode(extensions.digest(current_setting(''test.calendar_status.token.actor1''), ''sha256''), ''hex''))',
  '42501', null, 'a browser session cannot call the service feed even with another account token digest');
reset role;

select is((select jsonb_agg(item->>'summary' order by item->>'start_date')
  from jsonb_array_elements(current_setting('test.calendar_status.calendar.actor1')::jsonb->'events') item
  where item->>'status' = 'confirmed'),
  '["En Mer","À terre","Extra","Vacances","Congés Paternité","Arrêt Maladie","Accident du Travail","Arrêt de travail","Formation","RTT","Indisponible"]'::jsonb,
  'a real Marin exports every supported personal status except normalized rest, including daily overrides');
select is((select jsonb_agg(item->>'summary' order by item->>'start_date')
  from jsonb_array_elements(current_setting('test.calendar_status.calendar.actor2')::jsonb->'events') item
  where item->>'status' = 'confirmed'),
  '["En Mer","À terre","Extra","Vacances","Congés Paternité","Arrêt Maladie","Accident du Travail","Arrêt de travail","Formation","RTT","Indisponible"]'::jsonb,
  'a real Capitaine exports the same complete personal status list');
select is((select count(*)::integer from jsonb_array_elements(current_setting('test.calendar_status.calendar.actor1')::jsonb->'events') item
  where item->>'status' = 'cancelled'), 3, 'rest, accented rest and disembarked days are cancellation markers');
select ok(current_setting('test.calendar_status.calendar.actor1') not like '%Repos%'
  and current_setting('test.calendar_status.calendar.actor1') not like '%SECRET%'
  and current_setting('test.calendar_status.calendar.actor1') not like '%CAPTAIN VESSEL%',
  'the Marin calendar contains no rest label, free-form reason, name, comment or captain location');
select ok(current_setting('test.calendar_status.calendar.actor2') not like '%Repos%'
  and current_setting('test.calendar_status.calendar.actor2') not like '%SECRET%'
  and current_setting('test.calendar_status.calendar.actor2') not like '%MARIN VESSEL%',
  'the Capitaine calendar contains only their personal published planning and no free-form sensitive text');
select is(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar_status.token.actor1'), 'sha256'), 'hex')),
  current_setting('test.calendar_status.calendar.actor1')::jsonb, 'the existing Marin subscription and authenticated export have identical statuses');
select is(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar_status.token.actor2'), 'sha256'), 'hex')),
  current_setting('test.calendar_status.calendar.actor2')::jsonb, 'the Capitaine subscription preserves the same personal scope');
select ok(not exists (select 1 from jsonb_array_elements(current_setting('test.calendar_status.calendar.actor1')::jsonb->'events') marin
  join jsonb_array_elements(current_setting('test.calendar_status.calendar.actor2')::jsonb->'events') captain
    on marin->>'uid' = captain->>'uid'), 'two real accounts have disjoint opaque UIDs even for identical planning dates');

-- A rest assignment can contain a non-rest daily override. The other dates
-- must remove any previously imported entries without changing their UIDs.
insert into public.planning_releases(company_id, version_number, snapshot, published_by, published_by_name)
select company_id, 2, jsonb_build_object('scope', snapshot->'scope',
  'assignments', (select jsonb_agg(item || jsonb_build_object('status_label', 'Repos'))
    from jsonb_array_elements(snapshot->'assignments') item),
  'days', (select jsonb_agg(jsonb_build_object('id', person.id * 100 + 2, 'person_id', person.id,
    'work_date', '2039-01-02', 'sailor_status', 'Formation', 'source_label', 'seapilot-assignment-note',
    'slot365', 'assignment:' || person.id, 'comments', 'SECRET NEW NOTE'))
    from public.people person where person.company_id = current_setting('test.calendar_status.company')::bigint)),
  published_by, published_by_name
from public.planning_releases where company_id = current_setting('test.calendar_status.company')::bigint and version_number = 1;

set local role authenticated;
select set_config('request.jwt.claim.sub', '86200000-0000-0000-0000-000000000001', true);
select is((select jsonb_agg(item->>'summary') from jsonb_array_elements(public.personal_planning_calendar()->'events') item
  where item->>'status' = 'confirmed'), '["Formation"]'::jsonb,
  'a non-rest daily override on a rest assignment remains visible');
select is(public.personal_planning_calendar()#>>'{events,0,status}', 'cancelled', 'changing an active day to rest cancels the old event');
select is(public.personal_planning_calendar()#>>'{events,0,uid}', current_setting('test.calendar_status.calendar.actor1')::jsonb#>>'{events,0,uid}',
  'the cancellation keeps the previously imported UID');
select is((select count(*)::integer from jsonb_array_elements(public.personal_planning_calendar()->'events') item
  where item->>'status' = 'cancelled'), 13, 'every excluded rest day remains cancelled');
reset role;

insert into public.planning_releases(company_id, version_number, snapshot, published_by, published_by_name)
select company_id, 3, snapshot, published_by, published_by_name from public.planning_releases
where company_id = current_setting('test.calendar_status.company')::bigint and version_number = 2;
select is((select count(*)::integer from jsonb_array_elements(public.planning_calendar_feed(
  encode(extensions.digest(current_setting('test.calendar_status.token.actor1'), 'sha256'), 'hex'))->'events') item
  where item->>'status' = 'cancelled'), 13, 'rest cancellations remain present when a subscriber skips a release');

select * from finish();
rollback;
