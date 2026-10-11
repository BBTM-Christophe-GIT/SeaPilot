-- Personal calendar capability. Raw tokens are returned once, never stored;
-- every read rechecks the account, company, role and linked active person.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.planning_calendar_subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  company_id bigint not null references public.companies(id) on delete cascade,
  person_id bigint not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  foreign key (person_id, company_id) references public.people(id, company_id) on delete cascade
);
create index planning_calendar_subscriptions_person_company_idx
  on private.planning_calendar_subscriptions(person_id, company_id);
create index planning_calendar_subscriptions_company_idx
  on private.planning_calendar_subscriptions(company_id);
alter table private.planning_calendar_subscriptions enable row level security;
revoke all on private.planning_calendar_subscriptions from public, anon, authenticated, service_role;

-- This private helper deliberately reads current authorization records instead
-- of JWT metadata. Account removal/ban, role removal, person unlinking and
-- membership deactivation invalidate an already-issued calendar capability.
create function private.planning_calendar_context(p_user_id uuid)
returns table (company_id bigint, person_id bigint)
language sql stable security invoker set search_path = ''
as $$
  select profile.active_company_id, person.id
  from public.profiles profile
  join auth.users account on account.id = profile.id
    and account.deleted_at is null
    and not coalesce(account.is_anonymous, false)
    and (account.banned_until is null or account.banned_until <= statement_timestamp())
  join public.companies company on company.id = profile.active_company_id and company.active
  join public.company_memberships membership on membership.company_id = company.id
    and membership.user_id = profile.id and membership.active
  join public.people person on person.company_id = company.id
    and person.user_id = profile.id and person.active
  where profile.id = p_user_id
    and exists (
      select 1 from public.user_roles user_role
      where user_role.user_id = profile.id and user_role.company_id = company.id
        and user_role.role_key in ('admin', 'direction', 'armement', 'capitaine', 'marin')
    );
$$;

-- Only known operational labels leave SeaPilot. Medical statuses, arbitrary
-- free text and absence reasons are represented by the generic Indisponible.
create function private.planning_calendar_status(p_status text)
returns text
language sql immutable security invoker set search_path = ''
as $$
  select case regexp_replace(lower(translate(coalesce(p_status, ''),
    'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc')), '[^a-z0-9]', '', 'g')
    when 'enmer' then 'En Mer'
    when 'embarque' then 'En Mer'
    when 'travaille' then 'En Mer'
    when 'aterre' then 'À terre'
    when 'repos' then 'Repos'
    when 'debarque' then 'Repos'
    when 'vacance' then 'Vacances'
    when 'vacances' then 'Vacances'
    when 'conge' then 'Congés'
    when 'conges' then 'Congés'
    when 'formation' then 'Formation'
    when 'extra' then 'Extra'
    when 'rtt' then 'RTT'
    else 'Indisponible'
  end;
$$;

-- Matches the planning board's source precedence, including day overrides
-- attached to the person's own assignment. Names are read from the immutable
-- snapshot only, never from vessels or other live draft planning tables.
create function private.planning_calendar_days(p_snapshot jsonb, p_company_id bigint, p_person_id bigint)
returns table (work_date date, summary text, location text)
language sql stable security invoker set search_path = ''
as $$
  with assignments as (
    select item from jsonb_array_elements(coalesce(p_snapshot->'assignments', '[]'::jsonb)) item
    where item->>'crew_person_id' = p_person_id::text
      and coalesce(item->>'confirmation_status', 'confirmed') <> 'cancelled'
      and coalesce(item->>'company_id', p_company_id::text) = p_company_id::text
  ), assignment_overrides as materialized (
    select distinct on (day_item->>'slot365', (day_item->>'work_date')::date)
      day_item->>'slot365' as assignment_key, (day_item->>'work_date')::date as work_date,
      day_item->>'sailor_status' as status_label
    from jsonb_array_elements(coalesce(p_snapshot->'days', '[]'::jsonb)) day_item
    where day_item->>'person_id' = p_person_id::text
      and coalesce(day_item->>'company_id', p_company_id::text) = p_company_id::text
      and day_item->>'source_label' = 'seapilot-assignment-note'
    order by day_item->>'slot365', (day_item->>'work_date')::date, (day_item->>'id')::bigint desc
  ), candidates as (
    select day_date::date as work_date,
      coalesce(nullif(day_override.status_label, ''), assignment.item->>'status_label') as status_label,
      assignment.item->>'vessel_name' as vessel_name, 30 as priority,
      coalesce(assignment.item->>'vessel_id', lower(nullif(assignment.item->>'vessel_name', '')), 'unassigned') as vessel_key,
      coalesce(nullif(assignment.item->>'updated_at', '')::timestamptz, 'epoch'::timestamptz) as source_revision,
      (assignment.item->>'id')::bigint as source_id
    from assignments assignment
    cross join lateral generate_series((assignment.item->>'starts_on')::date::timestamp,
      (assignment.item->>'ends_on')::date::timestamp, interval '1 day') day_date
    left join assignment_overrides day_override on day_override.assignment_key = 'assignment:' || (assignment.item->>'id')
      and day_override.work_date = day_date::date
    union all
    select day_date::date, item->>'sailor_status', coalesce(nullif(item->>'vessel_name', ''), item->>'manual_vessel_name'),
      20, coalesce(item->>'vessel_id', lower(nullif(item->>'vessel_name', '')), 'unassigned'), 'epoch'::timestamptz, (item->>'id')::bigint
    from jsonb_array_elements(coalesce(p_snapshot->'periods', '[]'::jsonb)) item
    cross join lateral generate_series((item->>'starts_on')::date::timestamp,
      (item->>'ends_on')::date::timestamp, interval '1 day') day_date
    where item->>'person_id' = p_person_id::text
      and coalesce(item->>'company_id', p_company_id::text) = p_company_id::text
    union all
    select (item->>'work_date')::date, coalesce(nullif(item->>'sailor_status', ''), item->>'day_status'),
      coalesce(nullif(item->>'vessel_name', ''), item->>'manual_vessel_name'), 10,
      coalesce(item->>'vessel_id', lower(nullif(item->>'vessel_name', '')), 'unassigned'), 'epoch'::timestamptz, (item->>'id')::bigint
    from jsonb_array_elements(coalesce(p_snapshot->'days', '[]'::jsonb)) item
    where item->>'person_id' = p_person_id::text
      and coalesce(item->>'company_id', p_company_id::text) = p_company_id::text
      and coalesce(item->>'source_label', '') not in ('seapilot-vessel-location', 'seapilot-assignment-note')
  ), latest_per_vessel as (
    select distinct on (candidate.work_date, candidate.priority, candidate.vessel_key) candidate.*
    from candidates candidate
    where p_snapshot #>> '{scope,company_id}' = p_company_id::text
    order by candidate.work_date, candidate.priority, candidate.vessel_key, candidate.source_revision desc, candidate.source_id desc
  ), selected as (
    select candidate.* from latest_per_vessel candidate
    where candidate.priority = (select max(other.priority) from latest_per_vessel other where other.work_date = candidate.work_date)
  ), sanitized as (
    select selected.work_date, private.planning_calendar_status(selected.status_label) as summary,
      nullif(left(trim(selected.vessel_name), 160), '') as vessel_name
    from selected
  )
  select sanitized.work_date,
    case when count(*) > 1 then 'Planning à confirmer' else min(sanitized.summary) end,
    case when count(*) = 1 and min(sanitized.summary) in ('En Mer', 'À terre') then min(sanitized.vessel_name) else null end
  from sanitized group by sanitized.work_date;
$$;

create function private.personal_planning_calendar(p_user_id uuid, p_company_id bigint, p_person_id bigint)
returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  latest_release public.planning_releases%rowtype;
  calendar_events jsonb;
begin
  select * into latest_release from public.planning_releases release
    where release.company_id = p_company_id order by release.version_number desc limit 1;
  if latest_release.id is null then
    return jsonb_build_object('calendar_name', 'SeaPilot — Mon planning',
      'published_at', null, 'revision', 0, 'events', '[]'::jsonb);
  end if;
  with current_days as materialized (
    select * from private.planning_calendar_days(latest_release.snapshot, p_company_id, p_person_id)
  ), removed_days as (
    -- Keep the last released state of every removed date. A calendar client
    -- may skip several releases between refreshes, so one-release tombstones
    -- are insufficient. No live draft or historical private note is read.
    select distinct on (historical.work_date) historical.*
    from public.planning_releases release
    cross join lateral private.planning_calendar_days(release.snapshot, p_company_id, p_person_id) historical
    where release.company_id = p_company_id and release.version_number < latest_release.version_number
      and not exists (select 1 from current_days where current_days.work_date = historical.work_date)
    order by historical.work_date, release.version_number desc
  ), events as (
    select current_days.*, 'confirmed'::text as status from current_days
    union all
    select removed_days.*, 'cancelled'::text from removed_days
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'uid', encode(extensions.digest(p_user_id::text || ':' || p_company_id::text || ':' || events.work_date::text, 'sha256'), 'hex') || '@seapilot',
    'start_date', events.work_date, 'end_date', events.work_date + 1,
    'summary', events.summary, 'location', events.location, 'status', events.status
  ) order by events.work_date), '[]'::jsonb) into calendar_events from events;

  return jsonb_build_object('calendar_name', 'SeaPilot — Mon planning',
    'published_at', latest_release.published_at, 'revision', latest_release.version_number, 'events', calendar_events);
end;
$$;

create function public.get_planning_calendar_subscription()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_context record;
  subscription private.planning_calendar_subscriptions%rowtype;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'PLANNING_CALENDAR_AUTH_REQUIRED';
  end if;
  select * into actor_context from private.planning_calendar_context(actor_id);
  select * into subscription from private.planning_calendar_subscriptions token
    where token.user_id = actor_id and token.company_id = actor_context.company_id
      and token.person_id = actor_context.person_id and token.revoked_at is null;
  return jsonb_build_object('eligible', actor_context.person_id is not null,
    'active', subscription.user_id is not null, 'created_at', subscription.created_at);
end;
$$;

create function public.create_planning_calendar_subscription()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_context record;
  raw_token text;
  token_created_at timestamptz := clock_timestamp();
begin
  select * into actor_context from private.planning_calendar_context(actor_id);
  if actor_id is null or actor_context.person_id is null then
    raise exception using errcode = '42501', message = 'PLANNING_CALENDAR_NOT_ELIGIBLE';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor_id::text || ':planning-calendar', 0));
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.planning_calendar_subscriptions(user_id, company_id, person_id, token_hash, created_at)
  values (actor_id, actor_context.company_id, actor_context.person_id,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'), token_created_at)
  on conflict (user_id) do update set company_id = excluded.company_id, person_id = excluded.person_id,
    token_hash = excluded.token_hash, created_at = excluded.created_at, revoked_at = null;
  return jsonb_build_object('token', raw_token, 'created_at', token_created_at);
end;
$$;

create function public.revoke_planning_calendar_subscription()
returns void
language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'PLANNING_CALENDAR_AUTH_REQUIRED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor_id::text || ':planning-calendar', 0));
  update private.planning_calendar_subscriptions set revoked_at = clock_timestamp()
    where user_id = actor_id and revoked_at is null;
end;
$$;

create function public.personal_planning_calendar()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare actor_id uuid := auth.uid(); actor_context record;
begin
  select * into actor_context from private.planning_calendar_context(actor_id);
  if actor_id is null or actor_context.person_id is null then
    raise exception using errcode = '42501', message = 'PLANNING_CALENDAR_NOT_ELIGIBLE';
  end if;
  return private.personal_planning_calendar(actor_id, actor_context.company_id, actor_context.person_id);
end;
$$;

-- The anonymous HTTPS Edge Function hashes the bearer capability before
-- calling this service-only RPC. No user ID or company parameter is accepted.
create function public.planning_calendar_feed(p_token_hash text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare subscription private.planning_calendar_subscriptions%rowtype; actor_context record;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into subscription from private.planning_calendar_subscriptions token
    where token.token_hash = p_token_hash and token.revoked_at is null;
  if subscription.user_id is null then return null; end if;
  select * into actor_context from private.planning_calendar_context(subscription.user_id);
  if actor_context.person_id is null or actor_context.company_id <> subscription.company_id
    or actor_context.person_id <> subscription.person_id then return null; end if;
  return private.personal_planning_calendar(subscription.user_id, subscription.company_id, subscription.person_id);
end;
$$;

revoke all on function private.planning_calendar_context(uuid) from public, anon, authenticated, service_role;
revoke all on function private.planning_calendar_status(text) from public, anon, authenticated, service_role;
revoke all on function private.planning_calendar_days(jsonb, bigint, bigint) from public, anon, authenticated, service_role;
revoke all on function private.personal_planning_calendar(uuid, bigint, bigint) from public, anon, authenticated, service_role;
revoke all on function public.get_planning_calendar_subscription() from public, anon, authenticated, service_role;
revoke all on function public.create_planning_calendar_subscription() from public, anon, authenticated, service_role;
revoke all on function public.revoke_planning_calendar_subscription() from public, anon, authenticated, service_role;
revoke all on function public.personal_planning_calendar() from public, anon, authenticated, service_role;
revoke all on function public.planning_calendar_feed(text) from public, anon, authenticated, service_role;
grant execute on function public.get_planning_calendar_subscription() to authenticated;
grant execute on function public.create_planning_calendar_subscription() to authenticated;
grant execute on function public.revoke_planning_calendar_subscription() to authenticated;
grant execute on function public.personal_planning_calendar() to authenticated;
grant execute on function public.planning_calendar_feed(text) to service_role;

comment on table private.planning_calendar_subscriptions is 'Revocable personal calendar capabilities; only SHA-256 digests are retained. No Data API access.';
comment on function public.planning_calendar_feed(text) is 'Service-only calendar capability read. Exposes only the current account’s latest published personal planning and durable sanitized cancellation markers from earlier releases.';
