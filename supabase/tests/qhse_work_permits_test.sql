begin;

select no_plan();

create temporary table permit_test_actors(label text primary key, actor uuid, person_id bigint, company_id bigint);
create temporary table permit_test_locations(label text primary key, id bigint, company_id bigint);
grant select on permit_test_actors, permit_test_locations to authenticated;

insert into public.companies(code, name, active) values
  ('work-permit-test-a', 'Permis de travaux A', true),
  ('work-permit-test-b', 'Permis de travaux B', true);

do $$
declare
  actor_label text;
  actor uuid;
  company bigint;
  person bigint;
  n integer := 0;
begin
  foreach actor_label in array array['admin', 'direction', 'armement', 'marin', 'capitaine', 'no-signature', 'unassigned', 'foreign-admin', 'temporary-captain'] loop
    n := n + 1;
    actor := ('8da60000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
    select id into strict company from public.companies
    where code = case when actor_label = 'foreign-admin' then 'work-permit-test-b' else 'work-permit-test-a' end;

    insert into auth.users(id, email) values(actor, actor_label || '-work-permit@example.invalid');
    insert into public.profiles(id, email, display_name, active_company_id)
      values(actor, actor_label || '-work-permit@example.invalid', 'Permit fixture ' || actor_label, company);
    insert into public.company_memberships(company_id, user_id, active)
      values(company, actor, true) on conflict (company_id, user_id) do update set active = true;
    insert into public.user_roles(company_id, user_id, role_key) values(company, actor,
      case actor_label when 'foreign-admin' then 'admin' when 'no-signature' then 'capitaine'
        when 'unassigned' then 'marin' when 'temporary-captain' then 'marin' else actor_label end);
    insert into public.people(company_id, user_id, first_name, last_name, active)
      values(company, actor, 'Permit fixture', actor_label, true) returning id into person;
    insert into permit_test_actors values(actor_label, actor, person, company);
  end loop;
end $$;

with locations as (
  insert into public.vessels(company_id, name, active, asset_kind, length_overall)
  select c.id, v.name, true, v.asset_kind, case when v.name = 'GOURY' then '31.45 m' end
  from (values
    ('work-permit-test-a', 'GOURY', 'vessel'),
    ('work-permit-test-a', 'YARD - Le Havre', 'quay'),
    ('work-permit-test-a', 'Work permit fixture office', 'office'),
    ('work-permit-test-b', 'Work permit fixture foreign vessel', 'vessel')
  ) v(company_code, name, asset_kind)
  join public.companies c on c.code = v.company_code
  returning id, company_id, name
)
insert into permit_test_locations select name, id, company_id from locations;

insert into public.planning_assignments(
  company_id, vessel_id, crew_person_id, starts_on, ends_on, starts_at, ends_at, confirmation_status, assignment_role, status_label
)
select a.company_id, v.id, a.person_id, (current_timestamp at time zone 'Europe/Paris')::date - 1,
  (current_timestamp at time zone 'Europe/Paris')::date + 1,
  current_timestamp - interval '1 day', current_timestamp + interval '1 day',
  case when a.label = 'unassigned' then 'provisional' else 'confirmed' end,
  case when a.label in ('capitaine', 'no-signature') then 'Capitaine'
    when a.label = 'temporary-captain' then '2nd Capitaine' else 'Matelot' end, 'En Mer'
from permit_test_actors a
join permit_test_locations v on v.label = 'GOURY'
where a.label in ('marin', 'capitaine', 'no-signature', 'armement', 'unassigned', 'temporary-captain');

insert into public.planning_days(company_id, person_id, vessel_id, work_date, function_label, sailor_status, slot365, source_label)
select a.company_id, a.person_id, assignment.vessel_id, (current_timestamp at time zone 'Europe/Paris')::date,
  'Capitaine', 'En Mer', 'assignment:' || assignment.id, 'seapilot-assignment-note'
from permit_test_actors a join public.planning_assignments assignment on assignment.crew_person_id = a.person_id
where a.label = 'temporary-captain';

insert into public.working_time_profile_signatures(
  company_id, person_id, version_number, storage_bucket, storage_path, mime_type, file_size_bytes, sha256, valid_from, created_by
)
select company_id, person_id, 1, 'working-time-signatures', company_id || '/' || person_id || '/permit-fixture.png',
  'image/png', 128, repeat('b', 64), clock_timestamp() - interval '1 minute', actor
from permit_test_actors where label in ('capitaine', 'temporary-captain');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'admin'), true);

select is(
  (select array_agg(name order by name) from public.list_work_permit_locations()),
  array['GOURY', 'YARD - Le Havre'], 'Administration sees vessels and the Yard in its company'
);

insert into public.qhse_work_permits(vessel_id, title, permit_type, zone, starts_at)
select id, 'Permit fixture Yard', 'grue', 'Quai', date_trunc('day', current_timestamp, 'Europe/Paris')
from permit_test_locations where label = 'YARD - Le Havre';

select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'direction'), true);
select is((select count(*) from public.list_work_permit_locations()), 2::bigint, 'Direction has a fleet scope');
select is((select count(*) from public.qhse_work_permits), 1::bigint, 'Direction reads the Yard permit');

select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'foreign-admin'), true);
select is((select count(*) from public.qhse_work_permits), 0::bigint, 'Another company cannot see the Yard permit');

select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'unassigned'), true);
select is((select count(*) from public.list_work_permit_locations()), 0::bigint, 'A provisional assignment gives no permit access');

select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'armement'), true);
select is((select array_agg(name) from public.list_work_permit_locations()), array['GOURY'], 'Armement sees its confirmed assignment');

select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'marin'), true);
select is((select array_agg(name) from public.list_work_permit_locations()), array['GOURY'], 'Marin sees their assigned vessel');
select is((select count(*) from public.qhse_work_permits), 0::bigint, 'Marin cannot read the Yard permit');
select throws_ok(
  $q$insert into public.qhse_work_permits(vessel_id, title, permit_type, starts_at)
  select id, 'Inaccessible', 'grue', current_timestamp from permit_test_locations where label = 'YARD - Le Havre'$q$,
  '42501', null, 'Marin cannot create a permit on an unassigned site'
);

select throws_ok(
  $q$insert into public.qhse_work_permits(vessel_id, title, permit_type, starts_at)
  select id, 'Future date', 'grue', current_timestamp + interval '1 day' from permit_test_locations where label = 'GOURY'$q$,
  '23514', null, 'New permits are dated today in Paris'
);

insert into public.qhse_work_permits(vessel_id, title, permit_type, zone, plan_key, point_x, point_y, starts_at, exclusion_zones)
select id, 'Permit fixture GOURY', 'grue', 'Salle de travail', 'pont-principal', .3, .4,
  date_trunc('day', current_timestamp, 'Europe/Paris'),
  '[{"planKey":"pont-principal","points":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}]},{"planKey":"pont-superieur","points":[{"x":0.1,"y":0},{"x":0.2,"y":0.1},{"x":0.1,"y":0.5}]}]'::jsonb
from permit_test_locations where label = 'GOURY';

select is(
  (select jsonb_array_length(exclusion_zones) from public.qhse_work_permits), 2,
  'Multiple polygons on different plans are persisted'
);

select throws_ok(
  $q$update public.qhse_work_permits
  set exclusion_zones = '[{"planKey":"yard-3d","points":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}]}]'$q$,
  '23514', null, 'Polygons must be on a plan of the permit location'
);

select throws_ok(
  $q$update public.qhse_work_permits
  set exclusion_zones = '[{"planKey":"pont-principal","points":[{"x":0,"y":0},{"x":2,"y":0},{"x":1,"y":1}]}]'$q$,
  '23514', null, 'Polygon vertices must be inside the plan'
);

select throws_ok(
  $q$update public.qhse_work_permits set status = 'open'$q$, '42501', null,
  'Direct table edits cannot forge a lifecycle transition'
);

select throws_ok(
  $q$select public.sign_work_permit(id, updated_at) from public.qhse_work_permits$q$,
  '42501', null, 'Marin cannot validate a permit'
);

select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'admin'), true);
select throws_ok(
  $q$select public.sign_work_permit(id, updated_at) from public.qhse_work_permits where title = 'Permit fixture GOURY'$q$,
  '42501', null, 'Fleet access alone does not grant validation'
);

select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'no-signature'), true);
select throws_ok(
  $q$select public.sign_work_permit(id, updated_at) from public.qhse_work_permits$q$,
  '55000', null, 'Assigned Capitaine must have an active signature'
);

select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'capitaine'), true);
select is((select array_agg(name) from public.list_work_permit_locations() where can_sign), array['GOURY'],
  'Only the assigned vessel is signable by Capitaine');

select throws_ok(
  $q$select public.sign_work_permit(id, updated_at - interval '1 microsecond') from public.qhse_work_permits$q$,
  '40001', null, 'An outdated permit cannot be signed'
);

select is(
  (select (public.sign_work_permit(id, updated_at)).status from public.qhse_work_permits),
  'open', 'Assigned Capitaine opens the permit with the stored signature'
);

select ok(
  (select captain_signed_at is not null and captain_signer_name = 'Permit fixture capitaine'
     and captain_signature_snapshot->>'signature_id' is not null and ends_at is null from public.qhse_work_permits),
  'Signature identity is frozen, while the open permit has no end time'
);

select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'marin'), true);
update public.qhse_work_permits set point_x = .5, point_y = .6;
update public.qhse_work_permits set point_x = null, point_y = null, closing_answers = '{"closing-1":"yes"}';
select ok(
  (select status = 'open' and point_x is null and point_y is null from public.qhse_work_permits),
  'Marin can move and remove a display pin without closing the permit'
);

update public.qhse_work_permits set exclusion_zones = '[]';
select ok(
  (select status = 'draft' and captain_signed_at is null from public.qhse_work_permits),
  'A material edit requires a new signature'
);

select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'temporary-captain'), true);
select is((select array_agg(name) from public.list_work_permit_locations() where can_sign), array['GOURY'],
  'The daily Captain override grants signing authority to the Marin account on its vessel');
select is((select (public.sign_work_permit(id, updated_at)).status from public.qhse_work_permits),
  'open', 'A temporary Captain can sign with their own active signature');
select is((select captain_signer_name from public.qhse_work_permits),
  'Permit fixture temporary-captain', 'The signature preserves the temporary Captain identity');

select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'marin'), true);
select is((select (public.pause_work_permit(id, updated_at)).status from public.qhse_work_permits),
  'paused', 'The assigned watch can pause the open permit');
select throws_ok(
  $q$update public.qhse_work_permits set zone = 'Autre'$q$,
  '55000', null, 'The signed scope is preserved while paused'
);
select is((select (public.resume_work_permit(id, updated_at)).status from public.qhse_work_permits),
  'open', 'The assigned watch can resume a paused permit');
select ok(
  (select jsonb_array_length(pause_history) = 1 and paused_seconds >= 0 and paused_at is null from public.qhse_work_permits),
  'Resume records the pause interval and its duration'
);

select is((select (public.pause_work_permit(id, updated_at)).status from public.qhse_work_permits),
  'paused', 'A second pause can be recorded');
select is((select (public.close_work_permit(id, updated_at)).status from public.qhse_work_permits),
  'closed', 'Closing a paused permit archives it');
select ok(
  (select ends_at = closed_at and ends_at >= starts_at and jsonb_array_length(pause_history) = 2
     and pause_history->1->>'ended_with' = 'close' from public.qhse_work_permits),
  'Server closure captures the actual end and finishes the second pause'
);

update public.qhse_work_permits set title = 'Changed archive';
select is((select title from public.qhse_work_permits), 'Permit fixture GOURY', 'Archived permits remain readable and immutable');
select throws_ok(
  $q$delete from public.qhse_work_permits$q$, '42501', null,
  'Removing a pin never grants permission to delete its permit'
);

-- A caller knowing a permit UUID and revision still needs the real company admin role.
select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'admin'), true);
select set_config('test.delete_permit_id', id::text, true),
  set_config('test.delete_permit_updated_at', updated_at::text, true)
from public.qhse_work_permits where title = 'Permit fixture GOURY';

select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'marin'), true);
select throws_ok(
  $q$select public.delete_work_permit(current_setting('test.delete_permit_id')::uuid,
    current_setting('test.delete_permit_updated_at')::timestamptz)$q$,
  '42501', null, 'Marin cannot delete a permit'
);
select is(
  (select array_agg(name || ':' || length_overall) from public.list_work_permit_locations_with_lengths()),
  array['GOURY:31.45 m'], 'Length metadata remains restricted to the assigned vessel'
);

select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'capitaine'), true);
select throws_ok(
  $q$select public.delete_work_permit(current_setting('test.delete_permit_id')::uuid,
    current_setting('test.delete_permit_updated_at')::timestamptz)$q$,
  '42501', null, 'Capitaine cannot delete a permit'
);

select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'direction'), true);
select throws_ok(
  $q$select public.delete_work_permit(current_setting('test.delete_permit_id')::uuid,
    current_setting('test.delete_permit_updated_at')::timestamptz)$q$,
  '42501', null, 'Direction cannot delete a permit despite fleet visibility'
);

select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'foreign-admin'), true);
select throws_ok(
  $q$select public.delete_work_permit(current_setting('test.delete_permit_id')::uuid,
    current_setting('test.delete_permit_updated_at')::timestamptz)$q$,
  '42501', null, 'An admin cannot delete a permit in another company'
);

select set_config('request.jwt.claim.sub', (select actor::text from permit_test_actors where label = 'admin'), true);
select throws_ok(
  $q$select public.delete_work_permit(current_setting('test.delete_permit_id')::uuid,
    current_setting('test.delete_permit_updated_at')::timestamptz - interval '1 microsecond')$q$,
  '40001', null, 'An admin cannot delete an outdated revision'
);
select throws_ok(
  $q$delete from public.qhse_work_permits$q$, '42501', null,
  'Admin deletion still requires the controlled RPC'
);
select lives_ok(
  $q$select public.delete_work_permit(current_setting('test.delete_permit_id')::uuid,
    current_setting('test.delete_permit_updated_at')::timestamptz)$q$,
  'An admin can delete a permit in their company'
);
select is((select count(*) from public.qhse_work_permits where title = 'Permit fixture GOURY'), 0::bigint,
  'The deleted permit no longer appears in archives');
select is((select count(*) from public.qhse_work_permits where title = 'Permit fixture Yard'), 1::bigint,
  'The other permit is preserved');
select * from finish();
rollback;
