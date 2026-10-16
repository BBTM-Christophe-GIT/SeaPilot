begin;
select no_plan();

select ok((select relrowsecurity from pg_class where oid = 'private.planning_calendar_subscriptions'::regclass), 'calendar capabilities have RLS');
select ok(not has_function_privilege('authenticated', 'private.planning_calendar_context(uuid)', 'EXECUTE'), 'browser cannot invoke the private calendar identity helper');
select ok(not has_table_privilege('authenticated', 'private.planning_calendar_subscriptions', 'SELECT'), 'browser cannot read capability hashes');
select ok(not has_function_privilege('anon', 'public.create_planning_calendar_subscription()', 'EXECUTE'), 'anonymous callers cannot create a subscription');
select ok(not has_function_privilege('anon', 'public.revoke_planning_calendar_subscription()', 'EXECUTE'), 'anonymous callers cannot revoke a subscription');
select ok(not has_function_privilege('anon', 'public.personal_planning_calendar()', 'EXECUTE'), 'anonymous callers cannot download personal planning');
select ok(not has_function_privilege('authenticated', 'public.planning_calendar_feed(text)', 'EXECUTE'), 'authenticated callers cannot bypass the token feed');
select ok(has_function_privilege('service_role', 'public.planning_calendar_feed(text)', 'EXECUTE'), 'only the trusted Edge Function can read the token feed');
select ok(not has_function_privilege('authenticated', 'private.personal_planning_calendar(uuid,bigint,bigint)', 'EXECUTE'), 'unfiltered calendar helper is private');

insert into public.companies(code, name) values ('calendar-fixture', 'Calendar fixture'), ('calendar-other', 'Other calendar tenant');
insert into auth.users(id, email) values
  ('86100000-0000-0000-0000-000000000001', 'calendar-admin@example.invalid'),
  ('86100000-0000-0000-0000-000000000002', 'calendar-marin@example.invalid'),
  ('86100000-0000-0000-0000-000000000003', 'calendar-captain@example.invalid'),
  ('86100000-0000-0000-0000-000000000004', 'calendar-other@example.invalid'),
  ('86100000-0000-0000-0000-000000000005', 'calendar-no-role@example.invalid'),
  ('86100000-0000-0000-0000-000000000006', 'calendar-direction@example.invalid'),
  ('86100000-0000-0000-0000-000000000007', 'calendar-armement@example.invalid');
insert into public.profiles(id, email, display_name, active_company_id)
select account.id, account.email, 'Private account name', company.id from auth.users account
join public.companies company on company.code = case when account.id = '86100000-0000-0000-0000-000000000004' then 'calendar-other' else 'calendar-fixture' end
where account.id::text like '86100000-%';
insert into public.user_roles(user_id, company_id, role_key)
select fixture.user_id, profile.active_company_id, fixture.role_key
from (values
  ('86100000-0000-0000-0000-000000000001'::uuid, 'admin'),
  ('86100000-0000-0000-0000-000000000002'::uuid, 'marin'),
  ('86100000-0000-0000-0000-000000000003'::uuid, 'capitaine'),
  ('86100000-0000-0000-0000-000000000004'::uuid, 'marin'),
  ('86100000-0000-0000-0000-000000000006'::uuid, 'direction'),
  ('86100000-0000-0000-0000-000000000007'::uuid, 'armement')
) fixture(user_id, role_key) join public.profiles profile on profile.id = fixture.user_id;
insert into public.people(company_id, user_id, first_name, last_name, active)
select active_company_id, id, 'Private', 'PERSON', true from public.profiles
where id::text like '86100000-%' and id <> '86100000-0000-0000-0000-000000000001';

do $$ begin
  perform set_config('test.calendar.company', (select id::text from public.companies where code = 'calendar-fixture'), true);
  perform set_config('test.calendar.other_company', (select id::text from public.companies where code = 'calendar-other'), true);
  perform set_config('test.calendar.marin', (select id::text from public.people where user_id = '86100000-0000-0000-0000-000000000002'), true);
  perform set_config('test.calendar.captain', (select id::text from public.people where user_id = '86100000-0000-0000-0000-000000000003'), true);
  perform set_config('test.calendar.other_person', (select id::text from public.people where user_id = '86100000-0000-0000-0000-000000000004'), true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '86100000-0000-0000-0000-000000000001', true);
select is(public.get_planning_calendar_subscription()->>'eligible', 'false', 'admin without a linked person cannot export a whole-company calendar');
select throws_ok('select public.create_planning_calendar_subscription()', '42501', 'PLANNING_CALENDAR_NOT_ELIGIBLE', 'admin without a linked person cannot create a capability');
select set_config('request.jwt.claim.sub', '86100000-0000-0000-0000-000000000005', true);
select throws_ok('select public.personal_planning_calendar()', '42501', 'PLANNING_CALENDAR_NOT_ELIGIBLE', 'a real person without a planning role cannot download planning');
select set_config('request.jwt.claim.sub', '86100000-0000-0000-0000-000000000002', true);
select is(public.get_planning_calendar_subscription()->>'eligible', 'true', 'the real Marin profile is eligible');
select is(public.get_planning_calendar_subscription()->>'active', 'false', 'no capability is created by the status read');
select is(public.personal_planning_calendar()->>'revision', '0', 'planning before its first distribution is empty');
select is(jsonb_array_length(public.personal_planning_calendar()->'events'), 0, 'an initial download contains no drafts');
do $$ declare created jsonb; begin
  created := public.create_planning_calendar_subscription();
  perform set_config('test.calendar.token', created->>'token', true);
  perform set_config('test.calendar.created_at', created->>'created_at', true);
end $$;
select ok(current_setting('test.calendar.token') ~ '^[0-9a-f]{64}$', 'the one-time capability has 256 bits of cryptographic entropy');
select is(public.get_planning_calendar_subscription()->>'active', 'true', 'the subscription is active after explicit creation');
select is(public.get_planning_calendar_subscription()->>'created_at', current_setting('test.calendar.created_at'), 'created_at status matches the exact timestamp returned at creation');
select ok(not (public.get_planning_calendar_subscription() ?| array['token', 'token_hash', 'user_id', 'person_id']), 'subscription status never returns the bearer secret or identities');
reset role;
select is((select token_hash from private.planning_calendar_subscriptions where user_id = '86100000-0000-0000-0000-000000000002'), encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex'), 'only the digest of the raw capability is stored');

-- Build a genuine released snapshot with all sensitive fields present. A
-- captain assigned to a sailor is deliberately NOT the owner of that sailor's
-- event. Cross-company and unlinked-person rows are also deliberately present.
insert into public.planning_releases(company_id, version_number, snapshot, published_by, published_by_name, published_at)
values (current_setting('test.calendar.company')::bigint, 1, jsonb_build_object(
  'scope', jsonb_build_object('company_id', current_setting('test.calendar.company')::bigint),
  'assignments', jsonb_build_array(
    jsonb_build_object('id', 101, 'crew_person_id', current_setting('test.calendar.marin')::bigint,
      'captain_person_id', current_setting('test.calendar.captain')::bigint, 'vessel_id', 5001, 'vessel_name', 'RELEASED VESSEL',
      'starts_on', '2037-01-01', 'ends_on', '2037-01-02', 'status_label', 'En Mer', 'confirmation_status', 'confirmed',
      'comments', 'SECRET INTERNAL NOTE', 'crew_name', 'SECRET PERSON NAME', 'assignment_role', 'SECRET ROLE', 'watch_group', 'SECRET WATCH'),
    jsonb_build_object('id', 102, 'crew_person_id', current_setting('test.calendar.captain')::bigint,
      'vessel_name', 'CAPTAIN VESSEL', 'starts_on', '2037-02-01', 'ends_on', '2037-02-01', 'status_label', 'En Mer'),
    jsonb_build_object('id', 103, 'crew_person_id', current_setting('test.calendar.other_person')::bigint,
      'vessel_name', 'SECRET OTHER COMPANY', 'starts_on', '2037-03-01', 'ends_on', '2037-03-01', 'status_label', 'En Mer'),
    jsonb_build_object('id', 104, 'crew_person_id', current_setting('test.calendar.marin')::bigint,
      'company_id', current_setting('test.calendar.other_company')::bigint, 'vessel_name', 'SECRET BAD TENANT ROW',
      'starts_on', '2037-04-01', 'ends_on', '2037-04-01', 'status_label', 'En Mer'),
    jsonb_build_object('id', 105, 'crew_person_id', current_setting('test.calendar.marin')::bigint,
      'vessel_name', 'SECRET CANCELLED', 'starts_on', '2037-05-01', 'ends_on', '2037-05-01', 'status_label', 'En Mer', 'confirmation_status', 'cancelled'),
    jsonb_build_object('id', 106, 'crew_person_id', null, 'crew_name', 'Private PERSON',
      'vessel_name', 'SECRET UNLINKED', 'starts_on', '2037-06-01', 'ends_on', '2037-06-01', 'status_label', 'En Mer')
  ),
  'days', jsonb_build_array(
    jsonb_build_object('id', 201, 'person_id', current_setting('test.calendar.marin')::bigint,
      'work_date', '2037-01-02', 'sailor_status', 'Arrêt Maladie', 'source_label', 'seapilot-assignment-note',
      'slot365', 'assignment:101', 'comments', 'SECRET DIAGNOSIS', 'vessel_name', 'SECRET MEDICAL LOCATION'),
    jsonb_build_object('id', 202, 'person_id', current_setting('test.calendar.marin')::bigint,
      'work_date', '2037-01-03', 'sailor_status', 'Vacance', 'vessel_name', 'SECRET VACATION DESTINATION'),
    jsonb_build_object('id', 203, 'person_id', current_setting('test.calendar.marin')::bigint,
      'work_date', '2037-01-01', 'sailor_status', 'Repos', 'comments', 'SECRET ORDINARY DAY'),
    jsonb_build_object('id', 204, 'person_id', current_setting('test.calendar.marin')::bigint,
      'work_date', '2037-01-04', 'sailor_status', 'SECRET CUSTOM MEDICAL REASON', 'vessel_name', 'SECRET MEDICAL PLACE'),
    jsonb_build_object('id', 205, 'person_id', current_setting('test.calendar.marin')::bigint,
      'work_date', '2037-01-05', 'sailor_status', 'En Mer', 'source_label', 'seapilot-vessel-location', 'comments', 'SECRET LOCATION NOTE')
  ),
  'periods', jsonb_build_array(jsonb_build_object('id', 301, 'person_id', current_setting('test.calendar.marin')::bigint,
    'starts_on', '2037-01-01', 'ends_on', '2037-01-01', 'sailor_status', 'Repos', 'comments', 'SECRET PERIOD')),
  'projects', jsonb_build_array(jsonb_build_object('title', 'SECRET PROJECT', 'charter_hire', 9000)),
  'absences', jsonb_build_array(jsonb_build_object('reason', 'SECRET ILLNESS REASON'))
), '86100000-0000-0000-0000-000000000001', 'SECRET PUBLISHER', '2036-12-01T10:00:00Z');

set local role authenticated;
select set_config('request.jwt.claim.sub', '86100000-0000-0000-0000-000000000002', true);
do $$ begin perform set_config('test.calendar.first', public.personal_planning_calendar()::text, true); end $$;
select is((current_setting('test.calendar.first')::jsonb)->>'revision', '1', 'the personal export reads the actual latest release');
select is(jsonb_array_length((current_setting('test.calendar.first')::jsonb)->'events'), 4, 'the real Marin receives only their own four days');
select is((current_setting('test.calendar.first')::jsonb)#>>'{events,0,summary}', 'En Mer', 'assignment takes precedence over a historical period and ordinary day');
select is((current_setting('test.calendar.first')::jsonb)#>>'{events,0,location}', 'RELEASED VESSEL', 'vessel name comes from the released assignment');
select is((current_setting('test.calendar.first')::jsonb)#>>'{events,0,end_date}', '2037-01-02', 'all-day end dates are exclusive');
select is((current_setting('test.calendar.first')::jsonb)#>>'{events,1,summary}', 'Arrêt Maladie', 'a published day override preserves the personal planning status without revealing its reason');
select is((current_setting('test.calendar.first')::jsonb)#>>'{events,1,location}', null, 'medical location is not exported');
select is((current_setting('test.calendar.first')::jsonb)#>>'{events,2,summary}', 'Vacances', 'personal daily-only leave remains visible after distribution');
select is((current_setting('test.calendar.first')::jsonb)#>>'{events,3,summary}', 'Indisponible', 'arbitrary status text is never copied into calendars');
select ok(current_setting('test.calendar.first') not like '%SECRET%', 'notes, names, roles, watch groups, projects, absence reasons and another tenant never leave SeaPilot');
select ok(((current_setting('test.calendar.first')::jsonb)#>>'{events,0,uid}') ~ '^[0-9a-f]{64}@seapilot$', 'event UIDs are opaque and stable rather than exposing person IDs');

select set_config('request.jwt.claim.sub', '86100000-0000-0000-0000-000000000003', true);
select is(jsonb_array_length(public.personal_planning_calendar()->'events'), 1, 'real Capitaine receives personal planning only, not their crew');
select is(public.personal_planning_calendar()#>>'{events,0,location}', 'CAPTAIN VESSEL', 'captain calendar is restricted to crew_person_id linked to that account');
select set_config('request.jwt.claim.sub', '86100000-0000-0000-0000-000000000004', true);
select is(public.personal_planning_calendar()->>'revision', '0', 'another real company cannot read the first company release');
select set_config('request.jwt.claim.sub', '86100000-0000-0000-0000-000000000006', true);
select is(public.get_planning_calendar_subscription()->>'eligible', 'true', 'a linked Direction profile can export personal planning');
select set_config('request.jwt.claim.sub', '86100000-0000-0000-0000-000000000007', true);
select is(public.get_planning_calendar_subscription()->>'eligible', 'true', 'a linked Armement profile can export personal planning');
reset role;

set local role service_role;
select is(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex')), current_setting('test.calendar.first')::jsonb, 'the subscription and authenticated download expose identical sanitized planning');
select is(public.planning_calendar_feed(null), null::jsonb, 'null token digest returns no data');
select is(public.planning_calendar_feed('not-a-token'), null::jsonb, 'malformed digest returns no data');
select is(public.planning_calendar_feed(repeat('0', 64)), null::jsonb, 'unknown capability returns no data');
reset role;

-- A saved draft can change without any calendar update. Only a new global
-- release changes events/revision; removed dates retain cancellation markers.
insert into public.vessels(company_id, name) values (current_setting('test.calendar.company')::bigint, 'SECRET DRAFT VESSEL');
set local session_replication_role = replica;
insert into public.planning_assignments(company_id, vessel_id, crew_person_id, starts_on, ends_on, starts_at, ends_at, status_label)
select current_setting('test.calendar.company')::bigint, id, current_setting('test.calendar.marin')::bigint,
  '2038-01-01', '2038-01-31', '2038-01-01T00:00:00Z', '2038-01-31T23:59:00Z', 'A Terre'
from public.vessels where name = 'SECRET DRAFT VESSEL';
set local session_replication_role = origin;
select is(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex')), current_setting('test.calendar.first')::jsonb, 'draft edits never alter a distributed calendar');
insert into public.planning_releases(company_id, version_number, snapshot, published_by, published_by_name, published_at)
values (current_setting('test.calendar.company')::bigint, 2, jsonb_build_object(
  'scope', jsonb_build_object('company_id', current_setting('test.calendar.company')::bigint),
  'days', jsonb_build_array(jsonb_build_object('id', 401, 'person_id', current_setting('test.calendar.marin')::bigint,
    'work_date', '2037-01-01', 'sailor_status', 'Repos', 'comments', 'SECRET NEW NOTE'))
), '86100000-0000-0000-0000-000000000001', 'SECRET PUBLISHER', '2036-12-02T10:00:00Z');
do $$ begin perform set_config('test.calendar.second', public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex'))::text, true); end $$;
select is(current_setting('test.calendar.second')::jsonb->>'revision', '2', 'an existing subscription advances to each new distribution');
select is(current_setting('test.calendar.second')::jsonb#>>'{events,0,summary}', 'Planning supprimé', 'a day changed to rest cancels its previously exported event');
select is(current_setting('test.calendar.second')::jsonb#>>'{events,0,status}', 'cancelled', 'a rest day is never an active calendar event');
select is(current_setting('test.calendar.second')::jsonb#>>'{events,0,uid}', current_setting('test.calendar.first')::jsonb#>>'{events,0,uid}', 'the same personal date keeps its UID across distributions');
select is((select count(*)::integer from jsonb_array_elements(current_setting('test.calendar.second')::jsonb->'events') item where item->>'status' = 'cancelled'), 4, 'removed personal dates and rest dates carry explicit cancellation markers');
select ok(current_setting('test.calendar.second') not like '%SECRET%', 'cancellation markers retain sanitized information only');
insert into public.planning_releases(company_id, version_number, snapshot, published_by, published_by_name, published_at)
select company_id, 3, snapshot, published_by, published_by_name, '2036-12-03T10:00:00Z'
from public.planning_releases where company_id = current_setting('test.calendar.company')::bigint and version_number = 2;
select is((select count(*)::integer from jsonb_array_elements(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex'))->'events') item where item->>'status' = 'cancelled'), 4, 'clients that skip an intermediate release still receive removed-date and rest-date cancellations');
select is(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex'))#>>'{events,1,uid}', current_setting('test.calendar.first')::jsonb#>>'{events,1,uid}', 'a cancellation keeps its original UID across later releases');
insert into public.planning_releases(company_id, version_number, snapshot, published_by, published_by_name, published_at)
values (current_setting('test.calendar.company')::bigint, 4, jsonb_build_object(
  'scope', jsonb_build_object('company_id', current_setting('test.calendar.company')::bigint),
  'assignments', jsonb_build_array(
    jsonb_build_object('id', 501, 'crew_person_id', current_setting('test.calendar.marin')::bigint, 'vessel_name', 'SAME VESSEL',
      'starts_on', '2037-01-07', 'ends_on', '2037-01-07', 'status_label', 'En Mer'),
    jsonb_build_object('id', 502, 'crew_person_id', current_setting('test.calendar.marin')::bigint, 'vessel_name', 'SAME VESSEL',
      'starts_on', '2037-01-07', 'ends_on', '2037-01-07', 'status_label', 'A Terre'),
    jsonb_build_object('id', 503, 'crew_person_id', current_setting('test.calendar.marin')::bigint, 'vessel_name', 'SECOND VESSEL',
      'starts_on', '2037-01-08', 'ends_on', '2037-01-08', 'status_label', 'En Mer', 'updated_at', '2036-12-10T10:00:00Z'),
    jsonb_build_object('id', 504, 'crew_person_id', current_setting('test.calendar.marin')::bigint, 'vessel_name', 'SECOND VESSEL',
      'starts_on', '2037-01-08', 'ends_on', '2037-01-08', 'status_label', 'A Terre', 'updated_at', '2036-12-05T10:00:00Z'),
    jsonb_build_object('id', 505, 'crew_person_id', current_setting('test.calendar.marin')::bigint, 'vessel_name', 'SHIP A',
      'starts_on', '2037-01-09', 'ends_on', '2037-01-09', 'status_label', 'En Mer'),
    jsonb_build_object('id', 506, 'crew_person_id', current_setting('test.calendar.marin')::bigint, 'vessel_name', 'SHIP B',
      'starts_on', '2037-01-09', 'ends_on', '2037-01-09', 'status_label', 'En Mer')
  ), 'days', jsonb_build_array(
    jsonb_build_object('id', 601, 'person_id', current_setting('test.calendar.marin')::bigint, 'work_date', '2037-01-07',
      'sailor_status', 'Arrêt Maladie', 'source_label', 'seapilot-assignment-note', 'slot365', 'assignment:501'),
    jsonb_build_object('id', 602, 'person_id', current_setting('test.calendar.marin')::bigint, 'work_date', '2037-01-08',
      'sailor_status', 'Arrêt Maladie', 'source_label', 'seapilot-assignment-note', 'slot365', 'assignment:504'),
    jsonb_build_object('id', 603, 'person_id', current_setting('test.calendar.marin')::bigint, 'work_date', '2037-01-10', 'sailor_status', 'RTT'),
    jsonb_build_object('id', 604, 'person_id', current_setting('test.calendar.marin')::bigint, 'work_date', '2037-01-11', 'sailor_status', 'Extra')
  )
), '86100000-0000-0000-0000-000000000001', 'SECRET PUBLISHER', '2036-12-04T10:00:00Z');
do $$ begin perform set_config('test.calendar.fourth', public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex'))::text, true); end $$;
select is(current_setting('test.calendar.fourth')::jsonb#>>'{events,4,summary}', 'À terre', 'a stale override does not replace a newer same-vessel assignment');
select is(current_setting('test.calendar.fourth')::jsonb#>>'{events,5,summary}', 'En Mer', 'published revision timestamps take precedence over assignment IDs when present');
select is(current_setting('test.calendar.fourth')::jsonb#>>'{events,6,summary}', 'Planning à confirmer', 'unresolved cross-vessel conflict is visible rather than silently choosing a ship');
select is(current_setting('test.calendar.fourth')::jsonb#>>'{events,6,location}', null, 'a conflicting daily event does not claim one assigned vessel');
select is(current_setting('test.calendar.fourth')::jsonb#>>'{events,7,summary}', 'RTT', 'the safe RTT planning status remains visible');
select is(current_setting('test.calendar.fourth')::jsonb#>>'{events,8,summary}', 'Extra', 'the safe Extra planning status remains visible');

update public.company_memberships set active = false where user_id = '86100000-0000-0000-0000-000000000002';
select is(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex')), null::jsonb, 'deactivation immediately blocks an already-issued capability');
update public.company_memberships set active = true where user_id = '86100000-0000-0000-0000-000000000002';
update public.people set active = false where user_id = '86100000-0000-0000-0000-000000000002';
select is(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex')), null::jsonb, 'inactive personnel cannot continue reading their calendar');
update public.people set active = true where user_id = '86100000-0000-0000-0000-000000000002';
update auth.users set banned_until = statement_timestamp() + interval '1 day' where id = '86100000-0000-0000-0000-000000000002';
select is(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex')), null::jsonb, 'an Auth ban is enforced on every subscription fetch');
update auth.users set banned_until = null, deleted_at = statement_timestamp() where id = '86100000-0000-0000-0000-000000000002';
select is(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex')), null::jsonb, 'soft-deleted Auth accounts cannot read a subscription');
update auth.users set deleted_at = null where id = '86100000-0000-0000-0000-000000000002';
delete from public.user_roles where user_id = '86100000-0000-0000-0000-000000000002';
select is(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex')), null::jsonb, 'removing the actual planning role blocks an existing capability');
insert into public.user_roles(user_id, company_id, role_key) values ('86100000-0000-0000-0000-000000000002', current_setting('test.calendar.company')::bigint, 'marin');
update public.people set user_id = null where id = current_setting('test.calendar.marin')::bigint;
select is(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex')), null::jsonb, 'unlinking a person invalidates the existing subscription');
update public.people set user_id = '86100000-0000-0000-0000-000000000002' where id = current_setting('test.calendar.marin')::bigint;
insert into public.people(company_id, first_name, last_name, active)
values (current_setting('test.calendar.company')::bigint, 'Replacement', 'PERSON', true);
update public.people set user_id = null where id = current_setting('test.calendar.marin')::bigint;
update public.people set user_id = '86100000-0000-0000-0000-000000000002' where first_name = 'Replacement' and company_id = current_setting('test.calendar.company')::bigint;
select is(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex')), null::jsonb, 'relinking an account to a different person cannot reuse a prior capability');
update public.people set user_id = null where first_name = 'Replacement' and company_id = current_setting('test.calendar.company')::bigint;
update public.people set user_id = '86100000-0000-0000-0000-000000000002' where id = current_setting('test.calendar.marin')::bigint;
update public.companies set active = false where id = current_setting('test.calendar.company')::bigint;
select is(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex')), null::jsonb, 'an inactive company cannot serve calendars');
update public.companies set active = true where id = current_setting('test.calendar.company')::bigint;
insert into public.company_memberships(company_id, user_id) values (current_setting('test.calendar.other_company')::bigint, '86100000-0000-0000-0000-000000000002');
update public.profiles set active_company_id = current_setting('test.calendar.other_company')::bigint where id = '86100000-0000-0000-0000-000000000002';
select is(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex')), null::jsonb, 'switching the current company invalidates a capability bound to the prior company');
update public.profiles set active_company_id = current_setting('test.calendar.company')::bigint where id = '86100000-0000-0000-0000-000000000002';

insert into public.people(company_id, user_id, first_name, last_name, active)
select active_company_id, id, 'Admin', 'PERSON', true from public.profiles where id = '86100000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '86100000-0000-0000-0000-000000000001', true);
select is(public.get_planning_calendar_subscription()->>'eligible', 'true', 'a linked Admin profile can use the personal calendar');
select is(jsonb_array_length(public.personal_planning_calendar()->'events'), 0, 'even an Admin personal calendar never exports their company crew');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '86100000-0000-0000-0000-000000000003', true);
select lives_ok('select public.revoke_planning_calendar_subscription()', 'a captain without a subscription can safely revoke their own capability');
reset role;
select ok(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex')) is not null, 'another user cannot revoke the Marin subscription');
set local role authenticated;
select set_config('request.jwt.claim.sub', '86100000-0000-0000-0000-000000000002', true);
do $$ begin perform set_config('test.calendar.new_token', public.create_planning_calendar_subscription()->>'token', true); end $$;
reset role;
select is(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.token'), 'sha256'), 'hex')), null::jsonb, 'explicit replacement invalidates the previous bearer link');
select ok(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.new_token'), 'sha256'), 'hex')) is not null, 'the replacement capability serves the same latest distribution');
set local role authenticated;
select set_config('request.jwt.claim.sub', '86100000-0000-0000-0000-000000000002', true);
select public.revoke_planning_calendar_subscription();
select is(public.get_planning_calendar_subscription()->>'active', 'false', 'the user can revoke their subscription from the account menu');
select is(public.personal_planning_calendar()->>'revision', '4', 'revoking an external subscription preserves authenticated downloads');
reset role;
select is(public.planning_calendar_feed(encode(extensions.digest(current_setting('test.calendar.new_token'), 'sha256'), 'hex')), null::jsonb, 'a revoked capability never returns planning');

select * from finish();
rollback;
