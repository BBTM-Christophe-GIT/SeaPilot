begin;

select plan(37);

select has_table('public', 'planning_releases', 'global planning releases are stored in Supabase');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.planning_releases'::regclass),
  'RLS is enabled on immutable releases'
);
select ok(
  not has_table_privilege('authenticated', 'public.planning_releases', 'SELECT'),
  'authenticated users cannot bypass the release RPCs'
);
select ok(
  has_function_privilege('authenticated', 'public.publish_planning_release()', 'EXECUTE'),
  'authenticated office users can invoke the controlled distribution RPC'
);
select ok(
  not has_function_privilege('anon', 'public.publish_planning_release()', 'EXECUTE'),
  'anonymous users cannot distribute a planning'
);
select ok(
  has_function_privilege('authenticated', 'public.delete_planning_leave(bigint)', 'EXECUTE'),
  'authenticated users can invoke the administrator-protected leave deletion RPC'
);
select ok(
  not has_function_privilege('anon', 'public.delete_planning_leave(bigint)', 'EXECUTE'),
  'anonymous users cannot invoke leave deletion'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.transition_planning_publication(text,bigint,date,date,bigint,text)',
    'EXECUTE'
  ),
  'the legacy period workflow is no longer callable'
);
select is(
  (
    select count(*)::integer
    from public.planning_action_permissions
    where action_key in ('submit', 'validate', 'reopen', 'archive')
  ),
  0,
  'legacy validation actions are removed from the role matrix'
);
select is(
  (
    select count(*)::integer
    from public.planning_action_permissions
    where role_key in ('capitaine', 'marin')
      and action_key in ('manage_conflict', 'manage_dependency', 'view_history')
  ),
  0,
  'terrain roles have no legacy write or governance capability'
);
select is(
  (
    select count(*)::integer
    from public.planning_action_permissions
    where role_key in ('capitaine', 'marin')
      and action_key not in ('read', 'read_notifications', 'request_absence')
  ),
  0,
  'terrain permissions are limited to reading and requesting leave'
);
select is(
  (
    select scope_mode
    from public.planning_action_permissions
    where role_key = 'armement' and action_key = 'publish'
  ),
  'company',
  'Armement can distribute the company planning'
);
select ok(
  not has_function_privilege('authenticated', 'public.planning_release_snapshot(bigint)', 'EXECUTE'),
  'the unfiltered snapshot helper is private'
);

insert into auth.users (id, email)
values
  ('73000000-0000-0000-0000-000000000001', 'planning-global-admin@example.invalid'),
  ('73000000-0000-0000-0000-000000000002', 'planning-global-armement@example.invalid'),
  ('73000000-0000-0000-0000-000000000003', 'planning-global-captain@example.invalid'),
  ('73000000-0000-0000-0000-000000000004', 'planning-global-sailor@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('73000000-0000-0000-0000-000000000001'::uuid, 'planning-global-admin@example.invalid', 'Planning global admin'),
    ('73000000-0000-0000-0000-000000000002'::uuid, 'planning-global-armement@example.invalid', 'Planning global armement'),
    ('73000000-0000-0000-0000-000000000003'::uuid, 'planning-global-captain@example.invalid', 'Planning global captain'),
    ('73000000-0000-0000-0000-000000000004'::uuid, 'planning-global-sailor@example.invalid', 'Planning global sailor')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('73000000-0000-0000-0000-000000000001'::uuid, 'admin'),
    ('73000000-0000-0000-0000-000000000002'::uuid, 'armement'),
    ('73000000-0000-0000-0000-000000000003'::uuid, 'capitaine'),
    ('73000000-0000-0000-0000-000000000004'::uuid, 'marin')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.vessels (company_id, name, acronym, active)
select id, 'GLOBAL TEST VESSEL', 'GTV', true
from public.companies
where code = 'bbtm';

insert into public.people (company_id, user_id, first_name, last_name, function_label, active)
select company.id, fixture.user_id, fixture.first_name, fixture.last_name, fixture.function_label, true
from (
  values
    ('73000000-0000-0000-0000-000000000003'::uuid, 'Camille', 'CAPITAINE', 'Capitaine'),
    ('73000000-0000-0000-0000-000000000004'::uuid, 'Marine', 'TEST', 'Matelot')
) fixture(user_id, first_name, last_name, function_label)
cross join public.companies company
where company.code = 'bbtm';

set local session_replication_role = replica;
insert into public.planning_assignments (
  company_id,
  vessel_id,
  captain_person_id,
  crew_person_id,
  starts_on,
  ends_on,
  starts_at,
  ends_at,
  assignment_role,
  status_label,
  confirmation_status,
  watch_group,
  comments,
  source_label
)
select
  company.id,
  vessel.id,
  captain.id,
  sailor.id,
  '2037-01-01',
  '2037-01-31',
  '2037-01-01 08:00:00+01'::timestamptz,
  '2037-01-31 20:00:00+01'::timestamptz,
  'Matelot',
  'En Mer',
  'confirmed',
  'Bordée 1',
  'Version diffusée',
  'seapilot'
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.name = 'GLOBAL TEST VESSEL'
join public.people captain on captain.company_id = company.id and captain.user_id = '73000000-0000-0000-0000-000000000003'
join public.people sailor on sailor.company_id = company.id and sailor.user_id = '73000000-0000-0000-0000-000000000004'
where company.code = 'bbtm';
set local session_replication_role = origin;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '73000000-0000-0000-0000-000000000002', true);

select lives_ok(
  $$select * from public.publish_planning_release()$$,
  'Armement distributes the current planning without validation'
);
select is(
  (select max(version_number) from public.planning_release_history()),
  1,
  'the first global distribution is version 1'
);
select is(
  (public.latest_planning_release() #>> '{snapshot,assignments,0,status_label}'),
  'En Mer',
  'the release stores the live planning state'
);
set local role postgres;
select ok(
  not public.planning_scope_is_locked('2037-01-01', '2037-01-31', null),
  'a distribution never locks a period'
);
set local role authenticated;
select lives_ok(
  $$update public.planning_assignments
    set status_label = 'Repos'
    where comments = 'Version diffusée'$$,
  'Armement keeps editing after distribution'
);
select is(
  (select status_label from public.planning_assignments where comments = 'Version diffusée'),
  'Repos',
  'the live draft contains the post-distribution change'
);

select set_config('request.jwt.claim.sub', '73000000-0000-0000-0000-000000000003', true);
select is(
  (public.latest_planning_release() #>> '{snapshot,assignments,0,status_label}'),
  'En Mer',
  'a captain still reads the last distributed snapshot'
);

select set_config('request.jwt.claim.sub', '73000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select * from public.publish_planning_release()$$,
  'Armement distributes the updated planning as a new version'
);

select set_config('request.jwt.claim.sub', '73000000-0000-0000-0000-000000000003', true);
select is(
  (select count(*)::integer from public.planning_release_history()),
  1,
  'a captain only receives metadata for the latest release'
);
select is(
  (select max(version_number) from public.planning_release_history()),
  2,
  'the terrain release metadata is the latest version'
);
select is(
  (public.latest_planning_release() #>> '{snapshot,assignments,0,status_label}'),
  'Repos',
  'a captain receives the newly distributed planning'
);
select throws_ok(
  $$select * from public.publish_planning_release()$$,
  '42501',
  null,
  'a captain cannot distribute the planning'
);

select set_config('request.jwt.claim.sub', '73000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.save_planning_absence(
      null,
      public.current_person_id(),
      'leave',
      '2037-02-01 08:00:00+01'::timestamptz,
      '2037-02-05 18:00:00+01'::timestamptz,
      ''
    )$$,
  'a sailor can request leave without a reason'
);
select is(
  (
    select reason
    from public.planning_absences
    where person_id = public.current_person_id()
    order by id desc
    limit 1
  ),
  '',
  'the optional leave reason is stored as an empty string'
);
select is(
  (
    select status
    from public.planning_absences
    where person_id = public.current_person_id()
    order by id desc
    limit 1
  ),
  'requested',
  'the leave request is pending approval'
);

set local role postgres;
insert into public.planning_dependencies (
  company_id,
  dependency_type,
  predecessor_kind,
  predecessor_id,
  successor_kind,
  successor_id,
  lag_minutes,
  starts_on,
  ends_on
)
values (
  public.current_planning_company_id(),
  'training_assignment',
  'absence',
  (select max(id) from public.planning_absences),
  'assignment',
  (select max(id) from public.planning_assignments),
  0,
  '2037-02-01',
  '2037-02-05'
);
set local role authenticated;

select set_config('request.jwt.claim.sub', '73000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.review_planning_absence(
      (select max(id) from public.planning_absences),
      'approve',
      null
    )$$,
  'Armement can approve a leave request'
);
select is(
  (select status from public.planning_absences order by id desc limit 1),
  'approved',
  'the approved leave is persisted'
);
select throws_ok(
  $$select public.delete_planning_leave((select max(id) from public.planning_absences))$$,
  '42501',
  null,
  'Armement cannot permanently delete leave'
);

select set_config('request.jwt.claim.sub', '73000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.delete_planning_leave((select max(id) from public.planning_absences))$$,
  'an administrator can permanently delete leave'
);
select is(
  (
    select count(*)::integer
    from public.planning_absences
    where requested_by = '73000000-0000-0000-0000-000000000004'
  ),
  0,
  'the leave row is deleted'
);
select is(
  (
    select count(*)::integer
    from public.planning_dependencies
    where predecessor_kind = 'absence'
      and predecessor_id = (
        select (payload #>> '{before,id}')::bigint
        from public.planning_change_log
        where entity_kind = 'absence' and action = 'delete'
        order by changed_at desc
        limit 1
      )
  ),
  0,
  'dependencies linked to the deleted leave are removed'
);
select is(
  (
    select count(*)::integer
    from public.planning_change_log
    where entity_kind = 'absence'
      and action = 'delete'
      and payload #>> '{before,requested_by}' = '73000000-0000-0000-0000-000000000004'
  ),
  1,
  'the deleted leave remains traceable in Planning history'
);

set local role postgres;
select throws_ok(
  $$update public.planning_releases set version_number = 99$$,
  '55000',
  'PLANNING_RELEASE_IMMUTABLE',
  'released versions are immutable'
);
select is(
  (select count(*)::integer from public.planning_publications where locked_at is not null),
  0,
  'legacy publication locks are cleared'
);

select * from finish();
rollback;
