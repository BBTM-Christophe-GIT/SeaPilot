begin;

select plan(44);

select has_table('public', 'working_time_registers', 'weekly and monthly registers are stored');
select has_table('public', 'working_time_intervals', 'work intervals are stored as the source of truth');
select has_table('public', 'working_time_day_comments', 'daily non-conformity comments are stored');
select has_table('public', 'working_time_profile_signatures', 'profile signatures are versioned');
select has_table('public', 'working_time_validations', 'validation snapshots are stored');
select has_table('public', 'working_time_audit_events', 'working-time mutations are audited');

select has_column('public', 'working_time_intervals', 'starts_at', 'intervals retain an absolute start');
select has_column('public', 'working_time_intervals', 'ends_at', 'intervals retain an absolute end');
select has_column('public', 'working_time_intervals', 'timezone_name', 'intervals retain the timezone');
select has_column('public', 'working_time_intervals', 'utc_offset_minutes', 'intervals retain the captured UTC offset');

select ok(
  (
    select bool_and(class.relrowsecurity)
    from pg_class class
    where class.oid in (
      'public.working_time_registers'::regclass,
      'public.working_time_intervals'::regclass,
      'public.working_time_day_comments'::regclass,
      'public.working_time_profile_signatures'::regclass,
      'public.working_time_validations'::regclass,
      'public.working_time_audit_events'::regclass
    )
  ),
  'RLS protects every public working-time table'
);
select ok(
  has_table_privilege('authenticated', 'public.working_time_registers', 'SELECT'),
  'authenticated users can read registers through RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.working_time_registers', 'INSERT'),
  'authenticated users cannot bypass controlled register writes'
);
select ok(
  not has_table_privilege('authenticated', 'public.working_time_registers', 'UPDATE'),
  'authenticated users cannot bypass controlled transitions'
);
select ok(
  not has_table_privilege('anon', 'public.working_time_registers', 'SELECT'),
  'anonymous users cannot read registers'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.transition_working_time_register(bigint,text,text)',
    'EXECUTE'
  ),
  'authenticated users can invoke controlled workflow transitions'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.transition_working_time_register(bigint,text,text)',
    'EXECUTE'
  ),
  'anonymous users cannot transition registers'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.register_working_time_profile_signature(bigint,text,text,bigint,text)',
    'EXECUTE'
  ),
  'authenticated users can register a controlled profile-signature version'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.register_working_time_profile_signature(bigint,text,text,bigint,text)',
    'EXECUTE'
  ),
  'anonymous users cannot register profile signatures'
);
select is(
  (select public from storage.buckets where id = 'working-time-signatures'),
  false,
  'profile signatures are kept in a private bucket'
);

insert into auth.users (id, email)
values
  ('76000000-0000-0000-0000-000000000001', 'working-time-captain@example.invalid'),
  ('76000000-0000-0000-0000-000000000002', 'working-time-sailor@example.invalid'),
  ('76000000-0000-0000-0000-000000000003', 'working-time-outsider@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('76000000-0000-0000-0000-000000000001'::uuid, 'working-time-captain@example.invalid', 'Capitaine Temps'),
    ('76000000-0000-0000-0000-000000000002'::uuid, 'working-time-sailor@example.invalid', 'Marin Temps'),
    ('76000000-0000-0000-0000-000000000003'::uuid, 'working-time-outsider@example.invalid', 'Marin Hors Bordée')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('76000000-0000-0000-0000-000000000001'::uuid, 'capitaine'),
    ('76000000-0000-0000-0000-000000000002'::uuid, 'marin'),
    ('76000000-0000-0000-0000-000000000003'::uuid, 'marin')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.people (
  company_id, user_id, first_name, last_name, function_label, sailor_number, active
)
select company.id, fixture.user_id, fixture.first_name, fixture.last_name,
       fixture.function_label, fixture.sailor_number, true
from (
  values
    ('76000000-0000-0000-0000-000000000001'::uuid, 'Camille', 'CAPITAINE', 'Capitaine', 'CAP-760'),
    ('76000000-0000-0000-0000-000000000002'::uuid, 'Alexandre', 'MARIN', 'Matelot', 'MAR-760'),
    ('76000000-0000-0000-0000-000000000003'::uuid, 'Océane', 'EXTERNE', 'Matelot', 'MAR-761')
) fixture(user_id, first_name, last_name, function_label, sailor_number)
cross join public.companies company
where company.code = 'bbtm';

insert into public.vessels (company_id, name, acronym, active)
select id, 'WORKING TIME TEST VESSEL', 'WTV', true
from public.companies where code = 'bbtm';

insert into public.planning_assignments (
  company_id, vessel_id, captain_person_id, crew_person_id, starts_on, ends_on,
  starts_at, ends_at, assignment_role, status_label, confirmation_status,
  watch_group, source_label
)
select company.id, vessel.id, captain.id, sailor.id,
       '2026-08-01', '2026-08-31',
       '2026-08-01 08:00:00+02'::timestamptz,
       '2026-08-31 20:00:00+02'::timestamptz,
       'Matelot', 'En Mer', 'confirmed', 'Bordée 1', 'working_time_test'
from public.companies company
join public.vessels vessel
  on vessel.company_id = company.id and vessel.name = 'WORKING TIME TEST VESSEL'
join public.people captain
  on captain.company_id = company.id and captain.user_id = '76000000-0000-0000-0000-000000000001'
join public.people sailor
  on sailor.company_id = company.id and sailor.user_id = '76000000-0000-0000-0000-000000000002'
where company.code = 'bbtm';

insert into public.working_time_profile_signatures (
  company_id, person_id, version_number, storage_path, mime_type,
  file_size_bytes, sha256, created_by
)
select company.id, person.id, 1,
       company.id || '/' || person.id || '/' || person.user_id || '.png',
       'image/png', 128, repeat(signature_hash.character, 64), person.user_id
from public.companies company
join public.people person on person.company_id = company.id
cross join lateral (
  select case when person.user_id = '76000000-0000-0000-0000-000000000001' then 'a' else 'b' end as character
) signature_hash
where company.code = 'bbtm'
  and person.user_id in (
    '76000000-0000-0000-0000-000000000001',
    '76000000-0000-0000-0000-000000000002'
  );

insert into public.working_time_registers (
  company_id, person_id, period_kind, period_start, period_end, created_by
)
select company.id, sailor.id, 'weekly', '2026-08-03', '2026-08-09', sailor.user_id
from public.companies company
join public.people sailor
  on sailor.company_id = company.id and sailor.user_id = '76000000-0000-0000-0000-000000000002'
where company.code = 'bbtm';

insert into public.working_time_intervals (
  company_id, register_id, person_id, local_work_date, starts_at, ends_at,
  timezone_name, utc_offset_minutes, vessel_id, watch_group,
  author_user_id, author_person_id, source_type
)
select register.company_id, register.id, register.person_id, '2026-08-03',
       '2026-08-03 08:00:00+02'::timestamptz,
       '2026-08-03 16:00:00+02'::timestamptz,
       'Europe/Paris', 120, vessel.id, 'Bordée 1', sailor.user_id, sailor.id, 'manual'
from public.working_time_registers register
join public.people sailor on sailor.id = register.person_id
join public.vessels vessel
  on vessel.company_id = register.company_id and vessel.name = 'WORKING TIME TEST VESSEL';

select throws_ok(
  $$
    insert into public.working_time_profile_signatures (
      company_id, person_id, version_number, storage_path, mime_type,
      file_size_bytes, sha256, created_by
    )
    select company_id, id, 2, company_id || '/' || id || '/duplicate.png',
           'image/png', 128, repeat('c', 64), user_id
    from public.people where user_id = '76000000-0000-0000-0000-000000000002'
  $$,
  '23505',
  null,
  'only one current signature version can be active per person'
);

select throws_ok(
  $$
    insert into public.working_time_validations (
      company_id, register_id, person_id, event_type, previous_status, new_status,
      actor_user_id, actor_person_id, subject_identity_snapshot, actor_identity_snapshot
    )
    select register.company_id, register.id, register.person_id,
           'signature_requested', 'draft', 'validated', sailor.user_id, sailor.id,
           '{}'::jsonb, '{}'::jsonb
    from public.working_time_registers register
    join public.people sailor on sailor.id = register.person_id
  $$,
  '23514',
  null,
  'validation rows cannot encode an invalid status transition'
);

select throws_ok(
  $$
    insert into public.working_time_validations (
      company_id, register_id, person_id, event_type, previous_status, new_status,
      actor_user_id, actor_person_id, signature_version_id,
      subject_identity_snapshot, actor_identity_snapshot, signature_snapshot
    )
    select register.company_id, register.id, register.person_id,
           'captain_validated', 'submitted', 'validated', captain.user_id, captain.id,
           sailor_signature.id, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
    from public.working_time_registers register
    join public.people captain
      on captain.company_id = register.company_id
     and captain.user_id = '76000000-0000-0000-0000-000000000001'
    join public.working_time_profile_signatures sailor_signature
      on sailor_signature.person_id = register.person_id and sailor_signature.valid_to is null
  $$,
  '23514',
  'WORKING_TIME_SIGNATURE_MISMATCH: validateur.',
  'a validation cannot freeze another person''s signature'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000002', true);

select lives_ok(
  $$select public.transition_working_time_register(
    (select id from public.working_time_registers limit 1),
    'request_sailor_signature',
    null
  )$$,
  'the sailor can request their own signature'
);
select is(
  (select status from public.working_time_registers limit 1),
  'awaiting_sailor_signature',
  'the register waits for the sailor signature'
);
select lives_ok(
  $$select public.transition_working_time_register(
    (select id from public.working_time_registers limit 1),
    'sailor_sign',
    null
  )$$,
  'the linked sailor can sign the register'
);
select is(
  (select status from public.working_time_registers limit 1),
  'submitted',
  'the sailor signature submits the register'
);
select is(
  (
    select signature_snapshot->>'sha256'
    from public.working_time_validations
    where event_type = 'sailor_signed'
  ),
  repeat('b', 64),
  'the sailor signature version is frozen in the validation event'
);
select is(
  (
    select vessel_snapshot #>> '{0,name}'
    from public.working_time_validations
    where event_type = 'sailor_signed'
  ),
  'WORKING TIME TEST VESSEL',
  'the vessel identity is frozen when the sailor signs'
);
select is(
  (
    select watch_snapshot #>> '{0}'
    from public.working_time_validations
    where event_type = 'sailor_signed'
  ),
  'Bordée 1',
  'the watch is frozen when the sailor signs'
);

select set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.transition_working_time_register(
    (select id from public.working_time_registers limit 1),
    'captain_validate',
    'Heures contrôlées'
  )$$,
  'the captain can validate a sailor in the same planned watch'
);
select is(
  (select status from public.working_time_registers limit 1),
  'validated',
  'captain validation closes the register'
);
select ok(
  (
    select signature_snapshot->>'storage_path'
      like '%76000000-0000-0000-0000-000000000001.png'
    from public.working_time_validations
    where event_type = 'captain_validated'
  ),
  'the captain profile-signature version is frozen at validation'
);
select ok(
  (select count(*) >= 3 from public.working_time_audit_events where entity_kind = 'validation'),
  'workflow events are copied into the append-only audit history'
);
select throws_ok(
  $$select public.transition_working_time_register(
    (select id from public.working_time_registers limit 1),
    'captain_validate',
    null
  )$$,
  '22023',
  'WORKING_TIME_INVALID_TRANSITION.',
  'an invalid status transition is rejected'
);
select throws_ok(
  $$select public.transition_working_time_register(
    (select id from public.working_time_registers limit 1),
    'reopen',
    null
  )$$,
  '22023',
  'WORKING_TIME_REOPEN_COMMENT_REQUIRED.',
  'reopening a register requires a reason'
);
select lives_ok(
  $$select public.transition_working_time_register(
    (select id from public.working_time_registers limit 1),
    'reopen',
    'Correction demandée après validation'
  )$$,
  'the captain can reopen the validated register with a reason'
);
select is(
  (select status from public.working_time_registers limit 1),
  'reopened',
  'the reopened status is persisted'
);
select throws_ok(
  $$update public.working_time_validations set comment = 'altéré' where event_type = 'sailor_signed'$$,
  '42501',
  null,
  'authenticated users have no direct update privilege on validation history'
);

select set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000003', true);
select is(
  (select count(*)::integer from public.working_time_registers),
  0,
  'a sailor outside the watch cannot read another register'
);

select set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::integer from public.working_time_registers),
  1,
  'the assigned captain can read the register'
);

reset role;
select throws_ok(
  $$
    insert into public.working_time_intervals (
      company_id, register_id, person_id, local_work_date, starts_at, ends_at,
      timezone_name, utc_offset_minutes, vessel_id, watch_group,
      author_user_id, author_person_id, source_type
    )
    select work_interval.company_id, work_interval.register_id, work_interval.person_id,
           '2026-08-03', '2026-08-03 15:00:00+02'::timestamptz,
           '2026-08-03 17:00:00+02'::timestamptz, 'Europe/Paris', 120,
           work_interval.vessel_id, work_interval.watch_group,
           work_interval.author_user_id, work_interval.author_person_id, 'manual'
    from public.working_time_intervals work_interval limit 1
  $$,
  '23P01',
  null,
  'overlapping work intervals are rejected'
);
select throws_ok(
  $$
    insert into public.working_time_intervals (
      company_id, register_id, person_id, local_work_date, starts_at, ends_at,
      timezone_name, utc_offset_minutes, vessel_id, watch_group,
      author_user_id, author_person_id, source_type
    )
    select work_interval.company_id, work_interval.register_id, work_interval.person_id,
           '2026-08-05', '2026-08-04 08:00:00+02'::timestamptz,
           '2026-08-04 09:00:00+02'::timestamptz, 'Europe/Paris', 120,
           work_interval.vessel_id, work_interval.watch_group,
           work_interval.author_user_id, work_interval.author_person_id, 'manual'
    from public.working_time_intervals work_interval limit 1
  $$,
  '23514',
  null,
  'the captured local date must match the interval timezone'
);
select throws_ok(
  $$
    insert into public.working_time_intervals (
      company_id, register_id, person_id, local_work_date, starts_at, ends_at,
      timezone_name, utc_offset_minutes, vessel_id, watch_group,
      author_user_id, author_person_id, source_type
    )
    select work_interval.company_id, work_interval.register_id, work_interval.person_id,
           '2026-08-04', '2026-08-04 10:00:00+02'::timestamptz,
           '2026-08-04 11:00:00+02'::timestamptz, 'Europe/Paris', 60,
           work_interval.vessel_id, work_interval.watch_group,
           work_interval.author_user_id, work_interval.author_person_id, 'manual'
    from public.working_time_intervals work_interval limit 1
  $$,
  '23514',
  null,
  'the captured UTC offset must match the interval timezone'
);

select * from finish();
rollback;
