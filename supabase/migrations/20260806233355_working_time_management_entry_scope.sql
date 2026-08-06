-- Allow management roles to prepare and correct draft work-time registers for
-- any active HR person in their company. Signature and validation separation
-- of duties remain enforced by transition_working_time_register.

create or replace function public.working_time_can_manage_entry_scope(target_company_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and public.user_belongs_to_company(target_company_id)
    and public.has_company_role(target_company_id, array['admin', 'armement']);
$$;

create or replace function public.working_time_can_edit_register(target_register_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.working_time_registers register
    where register.id = target_register_id
      and register.status in ('draft', 'reopened')
      and public.user_belongs_to_company(register.company_id)
      and (
        public.working_time_can_manage_entry_scope(register.company_id)
        or (
          register.person_id = public.current_person_id()
          and public.has_company_role(register.company_id, array['marin', 'capitaine'])
        )
        or public.working_time_captain_can_access_period(
          register.company_id,
          register.person_id,
          register.period_start,
          register.period_end
        )
      )
  );
$$;

create or replace function public.working_time_entry_context(
  p_starts_on date,
  p_ends_on date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  actor_person_id bigint := public.current_person_id();
  editable_people jsonb;
begin
  if auth.uid() is null or target_company_id is null or actor_person_id is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PROFILE_NOT_LINKED: fiche RH requise.';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception using errcode = '22023', message = 'WORKING_TIME_PERIOD_INVALID.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'person_id', person.id,
    'first_name', person.first_name,
    'last_name', person.last_name,
    'function_label', person.function_label,
    'is_self', person.id = actor_person_id
  ) order by person.id <> actor_person_id, person.last_name, person.first_name), '[]'::jsonb)
  into editable_people
  from public.people person
  where person.company_id = target_company_id
    and person.active
    and (
      public.working_time_can_manage_entry_scope(target_company_id)
      or (
        person.id = actor_person_id
        and public.has_company_role(target_company_id, array['marin', 'capitaine'])
      )
      or public.working_time_captain_can_access_period(
        target_company_id, person.id, p_starts_on, p_ends_on
      )
    );

  return jsonb_build_object(
    'current_person_id', actor_person_id,
    'editable_people', editable_people
  );
end;
$$;

create or replace function public.get_or_create_working_time_register(
  p_person_id bigint,
  p_period_kind text,
  p_period_start date
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  actor_person_id bigint := public.current_person_id();
  target_period_end date;
  saved_id bigint;
begin
  if auth.uid() is null or target_company_id is null or actor_person_id is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PROFILE_NOT_LINKED: fiche RH requise.';
  end if;
  if p_period_kind = 'weekly' then
    target_period_end := p_period_start + 6;
  elsif p_period_kind = 'monthly' and p_period_start = date_trunc('month', p_period_start)::date then
    target_period_end := (date_trunc('month', p_period_start) + interval '1 month - 1 day')::date;
  else
    raise exception using errcode = '22023', message = 'WORKING_TIME_PERIOD_INVALID.';
  end if;
  if not exists (
    select 1 from public.people person
    where person.id = p_person_id and person.company_id = target_company_id and person.active
  ) then
    raise exception using errcode = '23503', message = 'WORKING_TIME_PERSON_NOT_FOUND.';
  end if;
  if not (
    public.working_time_can_manage_entry_scope(target_company_id)
    or (
      p_person_id = actor_person_id
      and public.has_company_role(target_company_id, array['marin', 'capitaine'])
    )
    or public.working_time_captain_can_access_period(
      target_company_id, p_person_id, p_period_start, target_period_end
    )
  ) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: création du registre.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'working-time-register:' || target_company_id || ':' || p_person_id || ':' || p_period_kind || ':' || p_period_start,
    0
  ));
  select register.id into saved_id
  from public.working_time_registers register
  where register.company_id = target_company_id
    and register.person_id = p_person_id
    and register.period_kind = p_period_kind
    and register.period_start = p_period_start
    and register.period_end = target_period_end;

  if saved_id is null then
    insert into public.working_time_registers (
      company_id, person_id, period_kind, period_start, period_end, created_by
    ) values (
      target_company_id, p_person_id, p_period_kind, p_period_start, target_period_end, auth.uid()
    ) returning id into saved_id;
  end if;
  return saved_id;
end;
$$;

create or replace function public.save_working_time_interval(
  p_register_id bigint,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone_name text,
  p_vessel_id bigint default null,
  p_watch_group text default null,
  p_comment text default null,
  p_interval_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_register public.working_time_registers%rowtype;
  target_interval public.working_time_intervals%rowtype;
  actor_person_id bigint := public.current_person_id();
  target_local_date date;
  target_offset_minutes integer;
  saved_id bigint;
begin
  if auth.uid() is null or actor_person_id is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PROFILE_NOT_LINKED: fiche RH requise.';
  end if;
  select * into target_register
  from public.working_time_registers register
  where register.id = p_register_id
  for update;
  if target_register.id is null or not public.working_time_can_edit_register(target_register.id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: modification du registre.';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception using errcode = '22023', message = 'WORKING_TIME_INTERVAL_INVALID.';
  end if;
  if not exists (select 1 from pg_timezone_names zone where zone.name = p_timezone_name) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_TIMEZONE_INVALID.';
  end if;

  target_local_date := (p_starts_at at time zone p_timezone_name)::date;
  target_offset_minutes := (
    extract(epoch from (
      (p_starts_at at time zone p_timezone_name) - (p_starts_at at time zone 'UTC')
    )) / 60
  )::integer;
  if target_local_date not between target_register.period_start and target_register.period_end then
    raise exception using errcode = '22023', message = 'WORKING_TIME_INTERVAL_OUTSIDE_REGISTER.';
  end if;
  if p_vessel_id is not null and not exists (
    select 1 from public.vessels vessel
    where vessel.id = p_vessel_id and vessel.company_id = target_register.company_id
  ) then
    raise exception using errcode = '23503', message = 'WORKING_TIME_VESSEL_NOT_FOUND.';
  end if;

  if actor_person_id <> target_register.person_id
    and not public.working_time_can_manage_entry_scope(target_register.company_id)
    and not public.working_time_captain_can_access_period(
      target_register.company_id, target_register.person_id,
      target_local_date, target_local_date, p_vessel_id, nullif(trim(coalesce(p_watch_group, '')), '')
    ) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: bordée publiée.';
  end if;

  if p_interval_id is null then
    insert into public.working_time_intervals (
      company_id, register_id, person_id, local_work_date, starts_at, ends_at,
      timezone_name, utc_offset_minutes, vessel_id, watch_group, comment,
      author_user_id, author_person_id, source_type
    ) values (
      target_register.company_id, target_register.id, target_register.person_id,
      target_local_date, p_starts_at, p_ends_at, p_timezone_name, target_offset_minutes,
      p_vessel_id, nullif(trim(coalesce(p_watch_group, '')), ''),
      nullif(trim(coalesce(p_comment, '')), ''), auth.uid(), actor_person_id, 'manual'
    ) returning id into saved_id;
  else
    select * into target_interval
    from public.working_time_intervals work_interval
    where work_interval.id = p_interval_id
    for update;
    if target_interval.id is null
      or target_interval.register_id <> target_register.id
      or target_interval.voided_at is not null then
      raise exception using errcode = '23503', message = 'WORKING_TIME_INTERVAL_NOT_FOUND.';
    end if;
    if actor_person_id <> target_register.person_id
      and not public.working_time_can_manage_entry_scope(target_register.company_id)
      and not public.working_time_captain_can_access_period(
        target_register.company_id, target_register.person_id,
        target_interval.local_work_date, target_interval.local_work_date,
        target_interval.vessel_id, target_interval.watch_group
      ) then
      raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: intervalle d''origine.';
    end if;
    update public.working_time_intervals
    set local_work_date = target_local_date,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        timezone_name = p_timezone_name,
        utc_offset_minutes = target_offset_minutes,
        vessel_id = p_vessel_id,
        watch_group = nullif(trim(coalesce(p_watch_group, '')), ''),
        comment = nullif(trim(coalesce(p_comment, '')), '')
    where id = target_interval.id
    returning id into saved_id;
  end if;
  return saved_id;
end;
$$;

create or replace function public.void_working_time_interval(
  p_interval_id bigint,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_interval public.working_time_intervals%rowtype;
  target_register public.working_time_registers%rowtype;
  actor_person_id bigint := public.current_person_id();
begin
  if length(trim(coalesce(p_reason, ''))) < 2 then
    raise exception using errcode = '22023', message = 'WORKING_TIME_VOID_REASON_REQUIRED.';
  end if;
  select * into target_interval
  from public.working_time_intervals work_interval
  where work_interval.id = p_interval_id and work_interval.voided_at is null
  for update;
  if target_interval.id is null then
    raise exception using errcode = '23503', message = 'WORKING_TIME_INTERVAL_NOT_FOUND.';
  end if;
  select * into target_register
  from public.working_time_registers register
  where register.id = target_interval.register_id
  for update;
  if actor_person_id is null or not public.working_time_can_edit_register(target_register.id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: retrait de l''intervalle.';
  end if;
  if actor_person_id <> target_register.person_id
    and not public.working_time_can_manage_entry_scope(target_register.company_id)
    and not public.working_time_captain_can_access_period(
      target_register.company_id, target_register.person_id,
      target_interval.local_work_date, target_interval.local_work_date,
      target_interval.vessel_id, target_interval.watch_group
    ) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: bordée publiée.';
  end if;

  update public.working_time_intervals
  set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
  where id = target_interval.id;
  return target_interval.id;
end;
$$;

revoke all on function public.working_time_can_manage_entry_scope(bigint) from public, anon, authenticated;

comment on function public.working_time_can_manage_entry_scope(bigint) is
  'True for linked admin or armement users allowed to prepare company work-time drafts.';
comment on function public.working_time_entry_context(date, date) is
  'Lists active HR people in the company for admin/armement, self for sailors, and published-watch crew for captains.';
