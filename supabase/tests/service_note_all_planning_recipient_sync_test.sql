begin;

select plan(43);

-- These identities exercise real authenticated Marin/Capitaine RLS, independently
-- of the current application session or its profile simulation controls.
insert into auth.users (id, email)
select ('78070000-0000-0000-0000-' || lpad(fixture.number::text, 12, '0'))::uuid,
       format('service-note-planning-%s@example.invalid', fixture.number)
from generate_series(1, 13) fixture(number);

insert into public.profiles (id, email, display_name, active_company_id)
select actor.id, actor.email, format('Service note planning %s', right(actor.id::text, 2)), company.id
from auth.users actor
cross join public.companies company
where actor.id::text like '78070000-%' and company.code = 'bbtm';

insert into public.company_memberships (company_id, user_id, active)
select profile.active_company_id, profile.id, true
from public.profiles profile
where profile.id::text like '78070000-%'
on conflict (company_id, user_id) do update set active = true;

insert into public.user_roles (user_id, company_id, role_key)
select profile.id, profile.active_company_id,
       case right(profile.id::text, 2) when '01' then 'direction' when '03' then 'capitaine' else 'marin' end
from public.profiles profile
where profile.id::text like '78070000-%';

insert into public.people (company_id, user_id, first_name, last_name, function_label, hired_on, active)
select company.id,
       case when fixture.number = 12 then null else ('78070000-0000-0000-0000-' || lpad(fixture.number::text, 12, '0'))::uuid end,
       fixture.first_name, fixture.last_name,
       case fixture.number when 1 then 'Direction' when 3 then 'Capitaine' else 'Marin' end,
       current_date - 365, true
from (values
  (1, 'Diane', 'NS AUTHOR'),
  (2, 'Pierre', 'HARRACHE'),
  (3, 'Pierre', 'LEPRETRE'),
  (4, 'Emilien', 'LAFAITEUR'),
  (5, 'Day', 'NS BEFORE'),
  (6, 'Period', 'NS INSERT'),
  (7, 'Period', 'NS UPDATE'),
  (8, 'Day', 'NS INSERT'),
  (9, 'Day', 'NS UPDATE'),
  (10, 'Cancelled', 'NS EXCLUDED'),
  (11, 'Past', 'NS EXCLUDED'),
  (12, 'Linked', 'NS LATER'),
  (13, 'Other', 'NS VESSEL')
) fixture(number, first_name, last_name)
cross join public.companies company
where company.code = 'bbtm';

create temporary table service_note_planning_fixture as
select fixture.number,
       ('78070000-0000-0000-0000-' || lpad(fixture.number::text, 12, '0'))::uuid as user_id,
       person.id as person_id, person.company_id
from generate_series(1, 13) fixture(number)
join public.people person
  on person.user_id = ('78070000-0000-0000-0000-' || lpad(fixture.number::text, 12, '0'))::uuid
  or (fixture.number = 12 and person.first_name = 'Linked' and person.last_name = 'NS LATER');
grant select on service_note_planning_fixture to authenticated;

insert into public.vessels (company_id, name, acronym, active)
select company.id, fixture.name, fixture.acronym, true
from (values ('NS ALL PLANNING TARGET', 'NSA'), ('NS ALL PLANNING OTHER', 'NSO')) fixture(name, acronym)
cross join public.companies company
where company.code = 'bbtm';

create temporary table service_note_planning_vessels as
select id as vessel_id, company_id, name
from public.vessels where name in ('NS ALL PLANNING TARGET', 'NS ALL PLANNING OTHER');
grant select on service_note_planning_vessels to authenticated;

insert into public.working_time_profile_signatures (
  company_id, person_id, version_number, storage_path, mime_type, file_size_bytes, sha256, created_by
)
select fixture.company_id, fixture.person_id, 1,
       format('%s/%s/service-note-planning.png', fixture.company_id, fixture.person_id),
       'image/png', 128, repeat('a', 64), fixture.user_id
from service_note_planning_fixture fixture where fixture.number in (1, 2);

-- All three Planning sources exist BEFORE a draft is created and published.
-- Their dates do not overlap the note's document date.
insert into public.planning_assignments (
  company_id, vessel_id, crew_person_id, captain_person_id,
  starts_on, ends_on, assignment_role, confirmation_status, source_label
)
select person.company_id, vessel.vessel_id, person.person_id,
       case when person.number = 2 then (select person_id from service_note_planning_fixture where number = 3) else null end,
       case when person.number = 11 then date_trunc('year', current_date)::date - 10 else current_date + 2 end,
       case when person.number = 11 then date_trunc('year', current_date)::date - 1 else current_date + 16 end,
       'Matelot', case when person.number = 10 then 'cancelled' else 'confirmed' end, 'service-note-all-planning-test'
from service_note_planning_fixture person
join service_note_planning_vessels vessel on vessel.company_id = person.company_id
where person.number in (2, 10, 11, 13)
  and vessel.name = case when person.number = 13 then 'NS ALL PLANNING OTHER' else 'NS ALL PLANNING TARGET' end;

insert into public.planning_periods (company_id, person_id, vessel_id, starts_on, ends_on, source_label)
select person.company_id, person.person_id, vessel.vessel_id, current_date + 3, current_date + 12, 'service-note-all-planning-test'
from service_note_planning_fixture person
join service_note_planning_vessels vessel on vessel.company_id = person.company_id and vessel.name = 'NS ALL PLANNING TARGET'
where person.number = 4;

insert into public.planning_days (company_id, person_id, vessel_id, work_date, source_label)
select person.company_id, person.person_id, vessel.vessel_id, current_date + 4, 'service-note-all-planning-test'
from service_note_planning_fixture person
join service_note_planning_vessels vessel on vessel.company_id = person.company_id and vessel.name = 'NS ALL PLANNING TARGET'
where person.number = 5;

-- Assignment annotations can outlive their cancelled parent. They must never
-- become an independent vessel affiliation at publication or through a trigger.
insert into public.planning_days (company_id, person_id, vessel_id, work_date, slot365, source_label)
select assignment.company_id, assignment.crew_person_id, assignment.vessel_id,
       current_date + 4, format('assignment:%s', assignment.id), 'service-note-all-planning-test'
from public.planning_assignments assignment
where assignment.crew_person_id = (select person_id from service_note_planning_fixture where number = 10);

insert into public.qhse_service_notes (
  company_id, chronology_code, subject, body, scope, status, author_person_id,
  author_identity_snapshot, author_signature_snapshot, authored_on, published_at, published_by, created_by,
  last_recalled_at, last_recalled_by
)
select author.company_id, fixture.code, fixture.subject, 'Consigne de test', 'vessels', fixture.status,
       author.person_id, '{}'::jsonb, '{}'::jsonb,
       case when fixture.subject = 'NS ALL PLANNING PREVIOUS YEAR' then date_trunc('year', current_date)::date - 1
            else greatest(current_date - 30, date_trunc('year', current_date)::date) end,
       case when fixture.status = 'draft' then null else current_timestamp - interval '30 days' end,
       case when fixture.status = 'draft' then null else author.user_id end, author.user_id,
       case when fixture.status = 'recalled' then current_timestamp else null end,
       case when fixture.status = 'recalled' then author.user_id else null end
from (values
  ('', 'NS ALL PLANNING PUBLICATION', 'draft'),
  ('NS ALL PLANNING ARCHIVED', 'NS ALL PLANNING ARCHIVED', 'archived'),
  ('', 'NS ALL PLANNING RECALLED', 'recalled'),
  ('NS ALL PLANNING PREVIOUS YEAR', 'NS ALL PLANNING PREVIOUS YEAR', 'published'),
  ('NS ALL PLANNING OTHER', 'NS ALL PLANNING OTHER', 'published')
) fixture(code, subject, status)
cross join service_note_planning_fixture author where author.number = 1;

create temporary table service_note_planning_notes as
select id as note_id, company_id, subject from public.qhse_service_notes where subject like 'NS ALL PLANNING %';
grant select on service_note_planning_notes to authenticated;

insert into public.qhse_service_note_target_vessels (company_id, note_id, vessel_id)
select note.company_id, note.note_id, vessel.vessel_id
from service_note_planning_notes note
join service_note_planning_vessels vessel on vessel.company_id = note.company_id
  and vessel.name = case when note.subject = 'NS ALL PLANNING OTHER' then 'NS ALL PLANNING OTHER' else 'NS ALL PLANNING TARGET' end;

select has_function('private', 'sync_service_note_recipients_on_period', array[]::text[], 'period synchronization exists');
select has_function('private', 'sync_service_note_recipients_on_day', array[]::text[], 'day synchronization exists');
select has_function('private', 'sync_service_note_recipients_on_person', array[]::text[], 'account-link synchronization exists');
select ok(not has_function_privilege('authenticated', 'private.sync_service_note_recipients_on_person()', 'execute'), 'clients cannot invoke the account-link trigger directly');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '78070000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"78070000-0000-0000-0000-000000000001"}', true);

select is(
  (select count(*)::integer from public.service_note_resolved_recipients((select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION'))),
  4, 'Direction resolves all current/future sources already present before publication'
);
select is(
  (select count(*)::integer from public.service_note_resolved_recipients((select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION')) recipient
    where recipient.user_id in ('78070000-0000-0000-0000-000000000002', '78070000-0000-0000-0000-000000000003', '78070000-0000-0000-0000-000000000004')),
  3, 'Pierre HARRACHE, Pierre LEPRETRE and Emilien LAFAITEUR resolve despite an earlier document date'
);
select lives_ok(
  format('select public.publish_service_note(%s)', (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION')),
  'the real publication RPC creates the register from future Planning assignments'
);
select is(
  (select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION')),
  4, 'publication persists all four eligible recipients'
);

-- The exact bell query and the shared register are checked under real role RLS.
select set_config('request.jwt.claim.sub', '78070000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"78070000-0000-0000-0000-000000000002"}', true);
select is((select count(*)::integer from public.qhse_service_notes where id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION')), 1, 'the real Marin account can read its vessel note');
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION')), 4, 'the real Marin sees the common recipient register');
select is(
  (select count(*)::integer from public.qhse_service_notes note
   where note.id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION') and note.status = 'published'
     and exists (select 1 from public.qhse_service_note_recipients recipient where recipient.note_id = note.id and recipient.user_id = auth.uid())
     and not exists (select 1 from public.qhse_service_note_signatures signature where signature.note_id = note.id and signature.user_id = auth.uid())),
  1, 'the unsigned Marin note is available to the notification bell'
);
select is((select count(*)::integer from public.qhse_service_notes where id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING OTHER')), 0, 'the Marin cannot read a note for another vessel');
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING OTHER')), 0, 'the Marin cannot read another vessel signature register');

select set_config('request.jwt.claim.sub', '78070000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"78070000-0000-0000-0000-000000000003"}', true);
select is((select count(*)::integer from public.qhse_service_notes where id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION')), 1, 'the real Capitaine account can read its vessel note');
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION')), 4, 'the real Capitaine sees the common recipient register');
select is(
  (select count(*)::integer from public.qhse_service_note_recipients recipient
   join public.qhse_service_notes note on note.id = recipient.note_id
   where recipient.user_id = auth.uid() and note.id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION') and note.status = 'published'
     and not exists (select 1 from public.qhse_service_note_signatures signature where signature.note_id = note.id and signature.user_id = auth.uid())),
  1, 'the unsigned Capitaine note is available to the notification bell'
);
select is((select count(*)::integer from public.qhse_service_notes where id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING OTHER')), 0, 'the Capitaine cannot read a note for another vessel');
select throws_ok(
  format('select public.service_note_resolved_recipients(%s)', (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION')),
  '42501', 'SERVICE_NOTE_TARGETING_FORBIDDEN.', 'a real Capitaine cannot invoke manager targeting RPCs'
);

select set_config('request.jwt.claim.sub', '78070000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"78070000-0000-0000-0000-000000000002"}', true);
select lives_ok(format('select public.sign_service_note(%s)', (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION')), 'the real Marin can sign its pending vessel note');
select is((select count(*)::integer from public.qhse_service_note_signatures where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION') and user_id = auth.uid()), 1, 'the Marin owns one captured signature');
reset role;

create temporary table service_note_planning_signed_before as
select to_jsonb(signature) as snapshot from public.qhse_service_note_signatures signature
where signature.note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION');

-- Existing prior-year recipients and their captured signatures remain an audit
-- trail; current embarkations must not introduce any further signing obligation.
insert into public.qhse_service_note_recipients (
  company_id, note_id, user_id, person_id, first_name_snapshot, last_name_snapshot, function_snapshot
)
select prior.company_id, prior.note_id, recipient.user_id, recipient.person_id,
       recipient.first_name_snapshot, recipient.last_name_snapshot, recipient.function_snapshot
from public.qhse_service_note_recipients recipient
cross join service_note_planning_notes prior
where recipient.note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION')
  and recipient.user_id = '78070000-0000-0000-0000-000000000002'
  and prior.subject = 'NS ALL PLANNING PREVIOUS YEAR';
insert into public.qhse_service_note_signatures (
  company_id, note_id, recipient_id, user_id, person_id, identity_snapshot,
  signature_version_id, signature_snapshot, signed_at, read_confirmed, signature_kind
)
select prior.company_id, prior.note_id, prior.id, signature.user_id, signature.person_id,
       signature.identity_snapshot, signature.signature_version_id, signature.signature_snapshot,
       signature.signed_at, signature.read_confirmed, signature.signature_kind
from public.qhse_service_note_signatures signature
join public.qhse_service_note_recipients prior on prior.user_id = signature.user_id
  and prior.note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PREVIOUS YEAR')
where signature.note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION');
create temporary table service_note_planning_previous_before as
select jsonb_build_object(
  'recipients', (select jsonb_agg(to_jsonb(recipient) order by recipient.id) from public.qhse_service_note_recipients recipient where recipient.note_id = prior.note_id),
  'signatures', (select jsonb_agg(to_jsonb(signature) order by signature.id) from public.qhse_service_note_signatures signature where signature.note_id = prior.note_id)
) as snapshot
from service_note_planning_notes prior where prior.subject = 'NS ALL PLANNING PREVIOUS YEAR';

-- New periods and days must maintain published notes after the publication RPC.
insert into public.planning_periods (company_id, person_id, vessel_id, starts_on, ends_on, source_label)
select person.company_id, person.person_id, vessel.vessel_id, current_date + 2, current_date + 9, 'service-note-all-planning-test'
from service_note_planning_fixture person
join service_note_planning_vessels vessel on vessel.company_id = person.company_id
  and vessel.name = case when person.number = 7 then 'NS ALL PLANNING OTHER' else 'NS ALL PLANNING TARGET' end
where person.number in (6, 7);
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION') and user_id = '78070000-0000-0000-0000-000000000006'), 1, 'a newly inserted future period adds the recipient');
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION') and user_id = '78070000-0000-0000-0000-000000000007'), 0, 'an unrelated vessel period creates no target-vessel obligation');
update public.planning_periods period
set vessel_id = (select vessel_id from service_note_planning_vessels where name = 'NS ALL PLANNING TARGET')
where period.person_id = (select person_id from service_note_planning_fixture where number = 7);
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION') and user_id = '78070000-0000-0000-0000-000000000007'), 1, 'moving a period to the target vessel adds the recipient');

insert into public.planning_days (company_id, person_id, vessel_id, work_date, source_label)
select person.company_id, person.person_id, vessel.vessel_id, current_date + 2, 'service-note-all-planning-test'
from service_note_planning_fixture person
join service_note_planning_vessels vessel on vessel.company_id = person.company_id
  and vessel.name = case when person.number = 9 then 'NS ALL PLANNING OTHER' else 'NS ALL PLANNING TARGET' end
where person.number in (8, 9);
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION') and user_id = '78070000-0000-0000-0000-000000000008'), 1, 'a newly inserted future planning day adds the recipient');
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION') and user_id = '78070000-0000-0000-0000-000000000009'), 0, 'an unrelated vessel day creates no target-vessel obligation');
update public.planning_days day
set vessel_id = (select vessel_id from service_note_planning_vessels where name = 'NS ALL PLANNING TARGET')
where day.person_id = (select person_id from service_note_planning_fixture where number = 9);
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION') and user_id = '78070000-0000-0000-0000-000000000009'), 1, 'moving a day to the target vessel adds the recipient');
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PREVIOUS YEAR')), 1, 'new periods and days create no additional prior-year signing obligation');

insert into public.planning_assignments (company_id, vessel_id, crew_person_id, starts_on, ends_on, assignment_role, confirmation_status, source_label)
select person.company_id, vessel.vessel_id, person.person_id,
       case when person.number = 11 then date_trunc('year', current_date)::date - 10 else current_date + 2 end,
       case when person.number = 11 then date_trunc('year', current_date)::date - 1 else current_date + 12 end,
       'Matelot', case when person.number = 10 then 'cancelled' else 'confirmed' end, 'service-note-all-planning-test'
from service_note_planning_fixture person
join service_note_planning_vessels vessel on vessel.company_id = person.company_id and vessel.name = 'NS ALL PLANNING TARGET'
where person.number in (1, 10, 11, 12);
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION') and user_id = '78070000-0000-0000-0000-000000000010'), 0, 'cancelled assignments add no recipient');
insert into public.planning_days (company_id, person_id, vessel_id, work_date, slot365, source_label)
select assignment.company_id, assignment.crew_person_id, assignment.vessel_id,
       current_date + 5, format('assignment:%s', assignment.id), 'service-note-all-planning-test'
from public.planning_assignments assignment
where assignment.crew_person_id = (select person_id from service_note_planning_fixture where number = 10)
order by assignment.id limit 1;
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION') and user_id = '78070000-0000-0000-0000-000000000010'), 0, 'stale days derived from cancelled assignments create no signing obligation');
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION') and user_id = '78070000-0000-0000-0000-000000000011'), 0, 'past assignments outside the authored date add no recipient');
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION') and user_id = '78070000-0000-0000-0000-000000000001'), 0, 'the issuer is excluded from their own register');
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION') and person_id = (select person_id from service_note_planning_fixture where number = 12)), 0, 'an assigned person without an account is initially excluded');
update public.people person
set user_id = '78070000-0000-0000-0000-000000000012'
where person.id = (select person_id from service_note_planning_fixture where number = 12);
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION') and user_id = '78070000-0000-0000-0000-000000000012'), 1, 'linking an account after its assignment repairs the pending register');

insert into public.planning_periods (company_id, person_id, vessel_id, starts_on, ends_on, source_label)
select person.company_id, person.person_id, vessel.vessel_id, current_date, current_date + 5, 'service-note-all-planning-test'
from service_note_planning_fixture person
join service_note_planning_vessels vessel on vessel.company_id = person.company_id and vessel.name = 'NS ALL PLANNING TARGET'
where person.number = 2;
insert into public.planning_days (company_id, person_id, vessel_id, work_date, source_label)
select person.company_id, person.person_id, vessel.vessel_id, current_date, 'service-note-all-planning-test'
from service_note_planning_fixture person
join service_note_planning_vessels vessel on vessel.company_id = person.company_id and vessel.name = 'NS ALL PLANNING TARGET'
where person.number = 2;
update public.planning_periods set comments = 'Unrelated edit' where source_label = 'service-note-all-planning-test';
update public.planning_days set comments = 'Unrelated edit' where source_label = 'service-note-all-planning-test';
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION') and user_id = '78070000-0000-0000-0000-000000000002'), 1, 'overlapping sources and unrelated edits never duplicate a recipient');
select is((select count(*)::integer from public.qhse_service_note_signatures where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION')), 1, 'synchronization preserves the captured signature count');
select is((select to_jsonb(signature) from public.qhse_service_note_signatures signature where signature.note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION')), (select snapshot from service_note_planning_signed_before), 'synchronization preserves the full captured signature unchanged');
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING ARCHIVED')), 0, 'archived notes never re-enter the signing workflow');
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING RECALLED')), 0, 'recalled notes never re-enter the signing workflow');
select is((select count(*)::integer from public.qhse_service_note_recipients where note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION')), 9, 'the active note contains exactly the nine eligible accounts');
select is(
  (select jsonb_build_object(
    'recipients', (select jsonb_agg(to_jsonb(recipient) order by recipient.id) from public.qhse_service_note_recipients recipient where recipient.note_id = prior.note_id),
    'signatures', (select jsonb_agg(to_jsonb(signature) order by signature.id) from public.qhse_service_note_signatures signature where signature.note_id = prior.note_id)
  ) from service_note_planning_notes prior where prior.subject = 'NS ALL PLANNING PREVIOUS YEAR'),
  (select snapshot from service_note_planning_previous_before),
  'later assignments and account linking leave the prior-year register and captured signature unchanged'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '78070000-0000-0000-0000-000000000012', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"78070000-0000-0000-0000-000000000012"}', true);
select is((select count(*)::integer from public.qhse_service_notes where id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION')), 1, 'the newly linked Marin reads the vessel note through RLS');
select is(
  (select count(*)::integer from public.qhse_service_note_recipients recipient
   join public.qhse_service_notes note on note.id = recipient.note_id
   where recipient.user_id = auth.uid() and note.id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION') and note.status = 'published'
     and not exists (select 1 from public.qhse_service_note_signatures signature where signature.note_id = note.id and signature.user_id = auth.uid())),
  1, 'the newly linked Marin has a real unsigned bell notification'
);
select set_config('request.jwt.claim.sub', '78070000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"78070000-0000-0000-0000-000000000002"}', true);
select is(
  (select count(*)::integer from public.qhse_service_note_recipients recipient
   where recipient.user_id = auth.uid() and recipient.note_id = (select note_id from service_note_planning_notes where subject = 'NS ALL PLANNING PUBLICATION')
     and not exists (select 1 from public.qhse_service_note_signatures signature where signature.note_id = recipient.note_id and signature.user_id = auth.uid())),
  0, 'a signed note stays out of the Marin bell after new Planning sources'
);

select * from finish();
rollback;
