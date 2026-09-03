begin;

select plan(11);

select has_function(
  'private',
  'add_active_vessel_service_note_recipient',
  array['bigint', 'bigint', 'bigint', 'date'],
  'the internal recipient synchronization helper exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.add_active_vessel_service_note_recipient(bigint,bigint,bigint,date)',
    'execute'
  ),
  'authenticated clients cannot invoke the internal synchronization helper'
);
select ok(
  exists (
    select 1
    from pg_trigger trigger
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'planning_assignments'
      and trigger.tgname = 'planning_assignments_sync_service_note_recipients'
      and not trigger.tgisinternal
  ),
  'Planning assignments trigger service-note recipient synchronization'
);

insert into auth.users (id, email)
values
  ('76000000-0000-0000-0000-000000000101', 'service-note-author@example.invalid'),
  ('76000000-0000-0000-0000-000000000102', 'service-note-sailor@example.invalid'),
  ('76000000-0000-0000-0000-000000000103', 'service-note-captain@example.invalid'),
  ('76000000-0000-0000-0000-000000000104', 'service-note-cancelled@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('76000000-0000-0000-0000-000000000101'::uuid, 'service-note-author@example.invalid', 'Service note author'),
    ('76000000-0000-0000-0000-000000000102'::uuid, 'service-note-sailor@example.invalid', 'Service note sailor'),
    ('76000000-0000-0000-0000-000000000103'::uuid, 'service-note-captain@example.invalid', 'Service note captain'),
    ('76000000-0000-0000-0000-000000000104'::uuid, 'service-note-cancelled@example.invalid', 'Service note cancelled sailor')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.vessels (company_id, name, acronym, active)
select company.id, fixture.name, fixture.acronym, true
from (
  values
    ('SERVICE NOTE TARGET VESSEL', 'SNT'),
    ('SERVICE NOTE OTHER VESSEL', 'SNO')
) fixture(name, acronym)
cross join public.companies company
where company.code = 'bbtm';

insert into public.people (
  company_id, user_id, first_name, last_name, function_label, hired_on, departed_on, active
)
select company.id, fixture.user_id, fixture.first_name, fixture.last_name,
       fixture.function_label, '2020-01-01'::date, null, true
from (
  values
    ('76000000-0000-0000-0000-000000000101'::uuid, 'Alice', 'AUTHOR', 'Direction'),
    ('76000000-0000-0000-0000-000000000102'::uuid, 'Sam', 'SAILOR', 'Marin'),
    ('76000000-0000-0000-0000-000000000103'::uuid, 'Camille', 'CAPTAIN', 'Capitaine'),
    ('76000000-0000-0000-0000-000000000104'::uuid, 'Chris', 'CANCELLED', 'Marin')
) fixture(user_id, first_name, last_name, function_label)
cross join public.companies company
where company.code = 'bbtm';

insert into public.qhse_service_notes (
  company_id, chronology_code, subject, body, scope, status, author_person_id,
  author_identity_snapshot, author_signature_snapshot, authored_on, published_at,
  published_by, created_by
)
select
  company.id,
  fixture.chronology_code,
  fixture.subject,
  'Consigne de test',
  'vessels',
  fixture.status,
  author.id,
  '{}'::jsonb,
  '{}'::jsonb,
  current_date - 30,
  current_timestamp - interval '30 days',
  author.user_id,
  author.user_id
from (
  values
    ('NS EMBARK ACTIVE', 'Active vessel note', 'published'),
    ('NS EMBARK ARCHIVED', 'Archived vessel note', 'archived'),
    ('NS EMBARK OTHER', 'Other vessel note', 'published')
) fixture(chronology_code, subject, status)
cross join public.companies company
join public.people author
  on author.company_id = company.id
 and author.user_id = '76000000-0000-0000-0000-000000000101'
where company.code = 'bbtm';

insert into public.qhse_service_note_target_vessels (company_id, note_id, vessel_id)
select note.company_id, note.id, vessel.id
from public.qhse_service_notes note
join public.vessels vessel
  on vessel.company_id = note.company_id
 and vessel.name = case
   when note.chronology_code = 'NS EMBARK OTHER' then 'SERVICE NOTE OTHER VESSEL'
   else 'SERVICE NOTE TARGET VESSEL'
 end
where note.chronology_code like 'NS EMBARK %';

insert into public.planning_assignments (
  company_id, vessel_id, captain_person_id, crew_person_id,
  starts_on, ends_on, assignment_role, confirmation_status, source_label
)
select
  company.id,
  vessel.id,
  captain.id,
  sailor.id,
  current_date + 2,
  current_date + 16,
  'Matelot',
  'confirmed',
  'seapilot-test'
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.name = 'SERVICE NOTE TARGET VESSEL'
join public.people sailor on sailor.company_id = company.id and sailor.user_id = '76000000-0000-0000-0000-000000000102'
join public.people captain on captain.company_id = company.id and captain.user_id = '76000000-0000-0000-0000-000000000103'
where company.code = 'bbtm';

select is(
  (
    select count(*)::integer
    from public.qhse_service_note_recipients recipient
    join public.qhse_service_notes note on note.id = recipient.note_id
    where note.chronology_code = 'NS EMBARK ACTIVE'
      and recipient.user_id = '76000000-0000-0000-0000-000000000102'
  ),
  1,
  'a future embarking sailor receives an already-published vessel note'
);
select is(
  (
    select count(*)::integer
    from public.qhse_service_note_recipients recipient
    join public.qhse_service_notes note on note.id = recipient.note_id
    where note.chronology_code = 'NS EMBARK ACTIVE'
      and recipient.user_id = '76000000-0000-0000-0000-000000000103'
  ),
  1,
  'the assigned captain receives the same active vessel note'
);
select is(
  (
    select count(*)::integer
    from public.qhse_service_note_recipients recipient
    join public.qhse_service_notes note on note.id = recipient.note_id
    where note.chronology_code = 'NS EMBARK ARCHIVED'
  ),
  0,
  'archived notes do not re-enter the signature workflow'
);
select is(
  (
    select count(*)::integer
    from public.qhse_service_note_recipients recipient
    join public.qhse_service_notes note on note.id = recipient.note_id
    where note.chronology_code = 'NS EMBARK OTHER'
  ),
  0,
  'notes for another vessel are not assigned'
);

insert into public.planning_assignments (
  company_id, vessel_id, crew_person_id, starts_on, ends_on,
  assignment_role, confirmation_status, source_label
)
select
  company.id,
  vessel.id,
  author.id,
  current_date,
  current_date + 5,
  'Direction',
  'confirmed',
  'seapilot-test'
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.name = 'SERVICE NOTE TARGET VESSEL'
join public.people author on author.company_id = company.id and author.user_id = '76000000-0000-0000-0000-000000000101'
where company.code = 'bbtm';

select is(
  (
    select count(*)::integer
    from public.qhse_service_note_recipients recipient
    where recipient.user_id = '76000000-0000-0000-0000-000000000101'
  ),
  0,
  'the note issuer is never added to their own signature register'
);

insert into public.planning_assignments (
  company_id, vessel_id, crew_person_id, starts_on, ends_on,
  assignment_role, confirmation_status, source_label
)
select
  company.id,
  vessel.id,
  sailor.id,
  current_date,
  current_date + 5,
  'Matelot',
  'cancelled',
  'seapilot-test'
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.name = 'SERVICE NOTE TARGET VESSEL'
join public.people sailor on sailor.company_id = company.id and sailor.user_id = '76000000-0000-0000-0000-000000000104'
where company.code = 'bbtm';

select is(
  (
    select count(*)::integer
    from public.qhse_service_note_recipients recipient
    where recipient.user_id = '76000000-0000-0000-0000-000000000104'
  ),
  0,
  'a cancelled assignment creates no signing obligation'
);

update public.planning_assignments assignment
set assignment_role = 'Matelot confirmé'
from public.people person
where assignment.crew_person_id = person.id
  and person.user_id = '76000000-0000-0000-0000-000000000102';

select is(
  (
    select count(*)::integer
    from public.qhse_service_note_recipients recipient
    join public.qhse_service_notes note on note.id = recipient.note_id
    where note.chronology_code = 'NS EMBARK ACTIVE'
      and recipient.user_id in (
        '76000000-0000-0000-0000-000000000102',
        '76000000-0000-0000-0000-000000000103'
      )
  ),
  2,
  'unrelated assignment edits do not duplicate recipients'
);

select is(
  (
    select count(*)::integer
    from public.qhse_service_note_recipients recipient
    join public.qhse_service_notes note on note.id = recipient.note_id
    where note.chronology_code like 'NS EMBARK %'
  ),
  2,
  'only the two eligible people are present in the active note register'
);

select * from finish();
rollback;
