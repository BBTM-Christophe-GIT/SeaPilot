-- Secure administrator-led SeaPilot user invitations.
--
-- Existing accounts are not changed. The provisioning RPC is callable only by
-- service_role and independently verifies that the initiating user is an active
-- administrator of the target company.
--
-- Rollback:
--   1. Deploy a client that no longer invokes admin-invite-user.
--   2. Drop public.provision_invited_seapilot_user(uuid,text,text,text[],bigint,uuid).
--   3. Keep user_invitations for audit, or export it before dropping the table.

create table if not exists public.user_invitations (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict,
  user_id uuid references public.profiles(id) on delete set null,
  email text not null,
  display_name text not null,
  role_keys text[] not null,
  person_id bigint references public.people(id) on delete set null,
  invited_by uuid references public.profiles(id) on delete set null,
  invited_by_name text not null,
  status text not null default 'sent',
  invited_at timestamptz not null default now(),
  constraint user_invitations_email_check check (email = lower(trim(email)) and position('@' in email) > 1),
  constraint user_invitations_display_name_check check (char_length(trim(display_name)) between 2 and 120),
  constraint user_invitations_roles_check check (
    cardinality(role_keys) between 1 and 5
    and role_keys <@ array['admin', 'direction', 'armement', 'capitaine', 'marin']::text[]
  ),
  constraint user_invitations_status_check check (status in ('sent', 'accepted', 'revoked', 'failed'))
);

create index if not exists user_invitations_company_invited_at_idx
  on public.user_invitations (company_id, invited_at desc);
create index if not exists user_invitations_email_idx
  on public.user_invitations (lower(email), invited_at desc);
create index if not exists user_invitations_user_id_idx
  on public.user_invitations (user_id) where user_id is not null;
create index if not exists user_invitations_person_id_idx
  on public.user_invitations (person_id) where person_id is not null;
create index if not exists user_invitations_invited_by_idx
  on public.user_invitations (invited_by) where invited_by is not null;

grant select on public.user_invitations to authenticated;
alter table public.user_invitations enable row level security;

drop policy if exists user_invitations_admin_read on public.user_invitations;
create policy user_invitations_admin_read on public.user_invitations
  for select to authenticated
  using (
    company_id = (select public.current_planning_company_id())
    and (select public.has_role('admin'))
  );

create or replace function public.provision_invited_seapilot_user(
  p_user_id uuid,
  p_email text,
  p_display_name text,
  p_role_keys text[],
  p_person_id bigint,
  p_invited_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint;
  target_email text := lower(trim(coalesce(p_email, '')));
  target_display_name text := trim(coalesce(p_display_name, ''));
  normalized_roles text[];
  actor_name text;
  target_person public.people%rowtype;
  invitation_id bigint;
begin
  select coalesce(array_agg(role_key order by role_key), array[]::text[])
  into normalized_roles
  from (
    select distinct lower(trim(role_key)) as role_key
    from unnest(coalesce(p_role_keys, array[]::text[])) as input_role(role_key)
    where trim(role_key) <> ''
  ) roles;

  if p_user_id is null
     or p_invited_by is null
     or target_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or char_length(target_email) > 254
     or char_length(target_display_name) not between 2 and 120
     or cardinality(normalized_roles) not between 1 and 5
     or exists (
       select 1
       from unnest(normalized_roles) as selected_role(role_key)
       where role_key not in ('admin', 'direction', 'armement', 'capitaine', 'marin')
     ) then
    raise exception using errcode = '22023', message = 'USER_INVITATION_INVALID';
  end if;

  select profile.active_company_id,
         coalesce(nullif(trim(profile.display_name), ''), profile.email)
  into target_company_id, actor_name
  from public.profiles profile
  join public.company_memberships membership
    on membership.company_id = profile.active_company_id
   and membership.user_id = profile.id
   and membership.active
  where profile.id = p_invited_by;

  if target_company_id is null or not exists (
    select 1
    from public.user_roles user_role
    where user_role.user_id = p_invited_by
      and user_role.company_id = target_company_id
      and user_role.role_key = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'USER_INVITATION_FORBIDDEN';
  end if;

  if exists (
    select 1
    from public.profiles profile
    where profile.id = p_user_id
      and profile.active_company_id <> target_company_id
  ) then
    raise exception using errcode = '23505', message = 'USER_INVITATION_COMPANY_CONFLICT';
  end if;

  if p_person_id is not null then
    select person.*
    into target_person
    from public.people person
    where person.id = p_person_id
      and person.company_id = target_company_id
      and person.active
      and (person.user_id is null or person.user_id = p_user_id)
    for update;

    if target_person.id is null then
      raise exception using errcode = '23503', message = 'USER_INVITATION_PERSON_UNAVAILABLE';
    end if;
  end if;

  insert into public.profiles (id, email, display_name, active_company_id, updated_at)
  values (p_user_id, target_email, target_display_name, target_company_id, now())
  on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        active_company_id = excluded.active_company_id,
        updated_at = now();

  insert into public.company_memberships as membership (company_id, user_id, active, created_by)
  values (target_company_id, p_user_id, true, p_invited_by)
  on conflict (company_id, user_id) do update
    set active = true,
        created_by = coalesce(membership.created_by, excluded.created_by);

  delete from public.user_roles
  where user_id = p_user_id
    and company_id = target_company_id;

  insert into public.user_roles (user_id, company_id, role_key, assigned_by)
  select p_user_id, target_company_id, role_key, p_invited_by
  from unnest(normalized_roles) as selected_role(role_key);

  if p_person_id is not null then
    update public.people
    set user_id = p_user_id,
        updated_at = now()
    where id = p_person_id;
  end if;

  insert into public.user_invitations (
    company_id, user_id, email, display_name, role_keys, person_id,
    invited_by, invited_by_name, status
  ) values (
    target_company_id, p_user_id, target_email, target_display_name,
    normalized_roles, p_person_id, p_invited_by, actor_name, 'sent'
  ) returning id into invitation_id;

  return jsonb_build_object(
    'invitationId', invitation_id,
    'userId', p_user_id,
    'email', target_email,
    'displayName', target_display_name,
    'roleKeys', to_jsonb(normalized_roles),
    'personId', p_person_id
  );
end;
$$;

revoke all on function public.provision_invited_seapilot_user(uuid, text, text, text[], bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.provision_invited_seapilot_user(uuid, text, text, text[], bigint, uuid)
  to service_role;

comment on table public.user_invitations is
  'Immutable audit of administrator-led SeaPilot account invitations, scoped by company.';
comment on function public.provision_invited_seapilot_user(uuid, text, text, text[], bigint, uuid) is
  'Atomically provisions the profile, company membership, roles, optional sailor link and invitation audit after Auth has created the invited user.';
