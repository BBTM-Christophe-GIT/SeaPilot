begin;

select plan(11);

select ok(
  to_regprocedure('public.transition_planning_publication(text,bigint,date,date,bigint,text)') is not null,
  'the publication transition RPC exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.transition_planning_publication(text,bigint,date,date,bigint,text)',
    'EXECUTE'
  ),
  'authenticated users can invoke the controlled publication transition'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.transition_planning_publication(text,bigint,date,date,bigint,text)',
    'EXECUTE'
  ),
  'anonymous users cannot invoke the publication transition'
);

insert into auth.users (id, email)
values ('72000000-0000-0000-0000-000000000001', 'planning-reopen-admin@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select
  '72000000-0000-0000-0000-000000000001'::uuid,
  'planning-reopen-admin@example.invalid',
  'Planning reopen admin',
  company.id
from public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select
  '72000000-0000-0000-0000-000000000001'::uuid,
  company.id,
  'admin'
from public.companies company
where company.code = 'bbtm';

insert into public.planning_publications (
  company_id,
  scope_key,
  starts_on,
  ends_on,
  status,
  current_version,
  comment,
  submitted_at,
  submitted_by,
  validated_at,
  validated_by,
  published_at,
  published_by,
  locked_at,
  locked_by,
  created_by,
  updated_by
)
select
  company.id,
  'fleet',
  '2036-01-01',
  '2036-01-31',
  'archived',
  2,
  'Période archivée après publication',
  now(),
  fixture.user_id,
  now(),
  fixture.user_id,
  now(),
  fixture.user_id,
  now(),
  fixture.user_id,
  fixture.user_id,
  fixture.user_id
from public.companies company
cross join (
  values ('72000000-0000-0000-0000-000000000001'::uuid)
) fixture(user_id)
where company.code = 'bbtm';

insert into public.planning_publications (
  company_id,
  scope_key,
  starts_on,
  ends_on,
  status,
  current_version,
  comment,
  locked_at,
  locked_by,
  created_by,
  updated_by
)
select
  company.id,
  'fleet',
  '2036-02-01',
  '2036-02-28',
  'archived',
  1,
  'Deuxième période archivée',
  now(),
  fixture.user_id,
  fixture.user_id,
  fixture.user_id
from public.companies company
cross join (
  values ('72000000-0000-0000-0000-000000000001'::uuid)
) fixture(user_id)
where company.code = 'bbtm';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$select public.transition_planning_publication(
      'reopen',
      (select id from public.planning_publications where starts_on = '2036-02-01'),
      null,
      null,
      null,
      'Court'
    )$$,
  '22023',
  null,
  'an archived planning still requires a meaningful reopen reason'
);

select lives_ok(
  $$select public.transition_planning_publication(
      'reopen',
      (select id from public.planning_publications where starts_on = '2036-01-01'),
      null,
      null,
      null,
      'Correction des affectations validées'
    )$$,
  'an administrator can reopen an archived planning'
);

select is(
  (select status from public.planning_publications where starts_on = '2036-01-01'),
  'modified_after_publication',
  'an archived published period returns to the editable post-publication state'
);
select ok(
  (select locked_at is null from public.planning_publications where starts_on = '2036-01-01'),
  'the server-side period lock is removed'
);
select is(
  (select current_version from public.planning_publications where starts_on = '2036-01-01'),
  2,
  'reopening preserves the current published version number'
);
select is(
  (select comment from public.planning_publications where starts_on = '2036-01-01'),
  'Correction des affectations validées',
  'the reopen justification is stored on the publication'
);
select is(
  (
    select count(*)::integer
    from public.planning_versions version
    join public.planning_publications publication on publication.id = version.publication_id
    where publication.starts_on = '2036-01-01'
  ),
  0,
  'reopening does not create or alter an immutable published snapshot'
);
select ok(
  exists (
    select 1
    from public.planning_change_log log
    join public.planning_publications publication on publication.id = log.entity_id
    where log.entity_kind = 'publication'
      and log.action = 'reopen'
      and log.payload ->> 'previous_status' = 'archived'
      and log.payload ->> 'status' = 'modified_after_publication'
      and publication.starts_on = '2036-01-01'
  ),
  'the archived-to-editable transition is audited'
);

select * from finish();
rollback;
