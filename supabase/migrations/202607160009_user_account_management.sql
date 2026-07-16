-- Secure administrator actions for resending account links and removing access.
-- Account deletion uses Supabase Auth soft deletion in the Edge Function so
-- business history that references public.profiles remains intact.

create or replace function public.prepare_seapilot_user_account_action(
  p_target_user_id uuid,
  p_requested_by uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_action text := lower(trim(coalesce(p_action, '')));
  actor_company_id bigint;
  actor_name text;
  target_email text;
  target_display_name text;
  target_membership_active boolean;
  target_is_admin boolean;
begin
  if p_target_user_id is null
     or p_requested_by is null
     or target_action not in ('resend_access', 'delete') then
    raise exception using errcode = '22023', message = 'USER_ACCOUNT_ACTION_INVALID';
  end if;

  select
    profile.active_company_id,
    coalesce(nullif(trim(profile.display_name), ''), profile.email)
  into actor_company_id, actor_name
  from public.profiles profile
  join public.company_memberships membership
    on membership.company_id = profile.active_company_id
   and membership.user_id = profile.id
   and membership.active
  join public.user_roles user_role
    on user_role.company_id = profile.active_company_id
   and user_role.user_id = profile.id
   and user_role.role_key = 'admin'
  where profile.id = p_requested_by;

  if actor_company_id is null then
    raise exception using errcode = '42501', message = 'USER_ACCOUNT_ACTION_FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(actor_company_id::text || ':user-account-management', 0)
  );

  select
    profile.email,
    coalesce(nullif(trim(profile.display_name), ''), profile.email),
    coalesce(membership.active, false),
    exists (
      select 1
      from public.user_roles user_role
      where user_role.company_id = actor_company_id
        and user_role.user_id = profile.id
        and user_role.role_key = 'admin'
    )
  into target_email, target_display_name, target_membership_active, target_is_admin
  from public.profiles profile
  left join public.company_memberships membership
    on membership.company_id = actor_company_id
   and membership.user_id = profile.id
  where profile.id = p_target_user_id
    and profile.active_company_id = actor_company_id;

  if target_email is null then
    raise exception using errcode = 'P0002', message = 'USER_ACCOUNT_NOT_FOUND';
  end if;

  if target_action = 'resend_access' and not target_membership_active then
    raise exception using errcode = '55000', message = 'USER_ACCOUNT_INACTIVE';
  end if;

  if target_action = 'delete' then
    if p_target_user_id = p_requested_by then
      raise exception using errcode = '42501', message = 'USER_ACCOUNT_SELF_DELETE';
    end if;

    if exists (
      select 1
      from public.company_memberships membership
      where membership.user_id = p_target_user_id
        and membership.company_id <> actor_company_id
        and membership.active
    ) then
      raise exception using errcode = '55000', message = 'USER_ACCOUNT_MULTI_COMPANY';
    end if;

    if target_is_admin and not exists (
      select 1
      from public.user_roles user_role
      join public.company_memberships membership
        on membership.company_id = user_role.company_id
       and membership.user_id = user_role.user_id
       and membership.active
      where user_role.company_id = actor_company_id
        and user_role.role_key = 'admin'
        and user_role.user_id <> p_target_user_id
    ) then
      raise exception using errcode = '55000', message = 'USER_ACCOUNT_LAST_ADMIN';
    end if;

    update public.people
    set user_id = null,
        updated_at = now()
    where company_id = actor_company_id
      and user_id = p_target_user_id;

    delete from public.user_roles
    where company_id = actor_company_id
      and user_id = p_target_user_id;

    update public.company_memberships
    set active = false
    where company_id = actor_company_id
      and user_id = p_target_user_id;

    update public.user_invitations
    set status = 'revoked'
    where company_id = actor_company_id
      and user_id = p_target_user_id
      and status in ('sent', 'accepted');
  end if;

  return jsonb_build_object(
    'userId', p_target_user_id,
    'email', target_email,
    'displayName', target_display_name,
    'companyId', actor_company_id,
    'action', target_action,
    'requestedBy', p_requested_by,
    'requestedByName', actor_name
  );
end;
$$;

revoke all on function public.prepare_seapilot_user_account_action(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.prepare_seapilot_user_account_action(uuid, uuid, text)
  to service_role;

comment on function public.prepare_seapilot_user_account_action(uuid, uuid, text) is
  'Validates administrator user-management actions and atomically revokes company access before an Auth soft deletion.';

-- A soft-deleted Auth user keeps its public profile so historical foreign keys
-- remain valid. Hide profiles whose company membership is no longer active from
-- administrator-facing profile lists.
drop policy if exists profiles_company_read on public.profiles;
create policy profiles_company_read on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (
      active_company_id = (select public.current_planning_company_id())
      and (select public.has_any_role(array['admin', 'direction']))
      and exists (
        select 1
        from public.company_memberships membership
        where membership.company_id = profiles.active_company_id
          and membership.user_id = profiles.id
          and membership.active
      )
    )
  );
