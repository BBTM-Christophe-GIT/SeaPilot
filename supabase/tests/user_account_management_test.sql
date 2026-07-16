begin;

select plan(14);

select has_function(
  'public',
  'prepare_seapilot_user_account_action',
  array['uuid', 'uuid', 'text'],
  'the controlled user-account action RPC exists'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.prepare_seapilot_user_account_action(uuid,uuid,text)',
    'EXECUTE'
  ),
  'service_role can prepare user-account actions'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.prepare_seapilot_user_account_action(uuid,uuid,text)',
    'EXECUTE'
  ),
  'browser users cannot invoke the privileged RPC directly'
);

insert into auth.users (id, email)
values
  ('74000000-0000-0000-0000-000000000001', 'account-admin@example.invalid'),
  ('74000000-0000-0000-0000-000000000002', 'account-target@example.invalid'),
  ('74000000-0000-0000-0000-000000000003', 'account-non-admin@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('74000000-0000-0000-0000-000000000001'::uuid, 'account-admin@example.invalid', 'Account Admin'),
    ('74000000-0000-0000-0000-000000000002'::uuid, 'account-target@example.invalid', 'Account Target'),
    ('74000000-0000-0000-0000-000000000003'::uuid, 'account-non-admin@example.invalid', 'Account Non Admin')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('74000000-0000-0000-0000-000000000001'::uuid, 'admin'),
    ('74000000-0000-0000-0000-000000000002'::uuid, 'marin'),
    ('74000000-0000-0000-0000-000000000003'::uuid, 'direction')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.people (
  company_id,
  user_id,
  first_name,
  last_name,
  email,
  function_label,
  grade_label,
  active
)
select
  company.id,
  '74000000-0000-0000-0000-000000000002'::uuid,
  'Account',
  'Target',
  'account-target@example.invalid',
  'Matelot',
  'Navigant',
  true
from public.companies company
where company.code = 'bbtm';

insert into public.user_invitations (
  company_id,
  user_id,
  email,
  display_name,
  role_keys,
  person_id,
  invited_by,
  invited_by_name,
  status
)
select
  company.id,
  '74000000-0000-0000-0000-000000000002'::uuid,
  'account-target@example.invalid',
  'Account Target',
  array['marin']::text[],
  person.id,
  '74000000-0000-0000-0000-000000000001'::uuid,
  'Account Admin',
  'sent'
from public.companies company
join public.people person
  on person.company_id = company.id
 and person.user_id = '74000000-0000-0000-0000-000000000002'::uuid
where company.code = 'bbtm';

select is(
  public.prepare_seapilot_user_account_action(
    '74000000-0000-0000-0000-000000000002',
    '74000000-0000-0000-0000-000000000001',
    'resend_access'
  ) #>> '{email}',
  'account-target@example.invalid',
  'an administrator can prepare an access-link resend'
);
select ok(
  (
    select membership.active
    from public.company_memberships membership
    join public.companies company on company.id = membership.company_id
    where company.code = 'bbtm'
      and membership.user_id = '74000000-0000-0000-0000-000000000002'
  ),
  'preparing a resend does not revoke access'
);
select throws_ok(
  $$select public.prepare_seapilot_user_account_action(
      '74000000-0000-0000-0000-000000000002',
      '74000000-0000-0000-0000-000000000003',
      'resend_access'
    )$$,
  '42501',
  'USER_ACCOUNT_ACTION_FORBIDDEN',
  'a non-administrator cannot manage accounts'
);
select throws_ok(
  $$select public.prepare_seapilot_user_account_action(
      '74000000-0000-0000-0000-000000000001',
      '74000000-0000-0000-0000-000000000001',
      'delete'
    )$$,
  '42501',
  'USER_ACCOUNT_SELF_DELETE',
  'an administrator cannot delete their own account'
);
select is(
  public.prepare_seapilot_user_account_action(
    '74000000-0000-0000-0000-000000000002',
    '74000000-0000-0000-0000-000000000001',
    'delete'
  ) #>> '{action}',
  'delete',
  'an administrator can prepare deletion of another user'
);
select is(
  (
    select count(*)::integer
    from public.user_roles
    where user_id = '74000000-0000-0000-0000-000000000002'
  ),
  0,
  'deletion removes the target roles'
);
select ok(
  not (
    select membership.active
    from public.company_memberships membership
    join public.companies company on company.id = membership.company_id
    where company.code = 'bbtm'
      and membership.user_id = '74000000-0000-0000-0000-000000000002'
  ),
  'deletion deactivates the company membership'
);
select is(
  (
    select person.user_id
    from public.people person
    where person.email = 'account-target@example.invalid'
  ),
  null,
  'deletion preserves and unlinks the HR record'
);
select is(
  (
    select invitation.status
    from public.user_invitations invitation
    where invitation.email = 'account-target@example.invalid'
    order by invitation.id desc
    limit 1
  ),
  'revoked',
  'deletion revokes the invitation audit status'
);
select ok(
  exists (
    select 1
    from public.profiles profile
    where profile.id = '74000000-0000-0000-0000-000000000002'
  ),
  'the RPC preserves the profile for business history before Auth soft deletion'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '74000000-0000-0000-0000-000000000001',
  true
);
select is(
  (
    select count(*)::integer
    from public.profiles profile
    where profile.id = '74000000-0000-0000-0000-000000000002'
  ),
  0,
  'administrators no longer see inactive profiles in user lists'
);
reset role;

select * from finish();
rollback;
