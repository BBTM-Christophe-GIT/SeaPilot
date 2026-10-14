-- Read-only ship scope for the connected account. Calendar months (not 30 days),
-- inclusive local dates, and the actual exclusive disembarkation timestamp.
-- Keep this independent from all operational write/approval helpers.
create function private.assigned_vessel_read_scope(p_company_id bigint)
returns bigint[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct assignment.vessel_id order by assignment.vessel_id), '{}'::bigint[])
  from public.profiles profile
  join auth.users account on account.id = profile.id
    and account.deleted_at is null and (account.banned_until is null or account.banned_until <= current_timestamp)
    and not coalesce(account.is_anonymous, false)
  join public.companies company on company.id = profile.active_company_id and company.active
  join public.company_memberships membership on membership.company_id = company.id
    and membership.user_id = profile.id and membership.active
  join public.people person on person.company_id = company.id and person.user_id = profile.id and person.active
  join public.planning_assignments assignment on assignment.company_id = company.id
    and (assignment.crew_person_id = person.id or assignment.captain_person_id = person.id)
    and assignment.confirmation_status = 'confirmed'
  join public.vessels vessel on vessel.id = assignment.vessel_id and vessel.company_id = company.id and vessel.asset_kind = 'vessel'
  where auth.uid() is not null and profile.id = auth.uid() and company.id = p_company_id
    and (current_timestamp at time zone 'Europe/Paris')::date between
      (coalesce((assignment.starts_at at time zone 'Europe/Paris')::date, assignment.starts_on) - interval '1 month')::date
      and (coalesce(((assignment.ends_at - interval '1 microsecond') at time zone 'Europe/Paris')::date, assignment.ends_on) + interval '1 month')::date;
$$;

create function private.can_read_assigned_vessel(p_company_id bigint, p_vessel_id bigint)
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null and p_company_id is not null and p_vessel_id is not null
    and p_vessel_id = any(private.assigned_vessel_read_scope(p_company_id));
$$;

revoke all on function private.assigned_vessel_read_scope(bigint) from public, anon, authenticated;
revoke all on function private.can_read_assigned_vessel(bigint, bigint) from public, anon, authenticated;
grant execute on function private.assigned_vessel_read_scope(bigint) to authenticated;
grant execute on function private.can_read_assigned_vessel(bigint, bigint) to authenticated;
grant usage on schema private to authenticated;

create function public.assigned_vessel_read_scope()
returns bigint[] language sql stable security invoker set search_path = '' as $$
  select private.assigned_vessel_read_scope(public.current_planning_company_id());
$$;
revoke all on function public.assigned_vessel_read_scope() from public, anon, authenticated;
grant execute on function public.assigned_vessel_read_scope() to authenticated;
comment on function private.assigned_vessel_read_scope(bigint) is 'Current account, active personnel/company/membership, confirmed live assignments: one calendar month before embarkation and after the last occupied local day. Read only; no Planning publication required.';
notify pgrst, 'reload schema';
