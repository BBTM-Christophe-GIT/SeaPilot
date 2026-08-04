-- Working Time step 5: controlled workflow writes, published-planning scope,
-- validation separation of duties and immutable validated registers.

create or replace function public.working_time_captain_can_access_period(
  target_company_id bigint,
  target_person_id bigint,
  target_starts_on date,
  target_ends_on date,
  target_vessel_id bigint default null,
  target_watch_group text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and public.user_belongs_to_company(target_company_id)
    and public.has_company_role(target_company_id, array['capitaine'])
    and exists (
      select 1
      from public.planning_assignments captain_assignment
      join public.planning_assignments crew_assignment
        on crew_assignment.company_id = captain_assignment.company_id
       and crew_assignment.vessel_id = captain_assignment.vessel_id
       and lower(trim(coalesce(crew_assignment.watch_group, '')))
         = lower(trim(coalesce(captain_assignment.watch_group, '')))
       and crew_assignment.starts_on <= target_ends_on
       and crew_assignment.ends_on >= target_starts_on
       and crew_assignment.confirmation_status <> 'cancelled'
      where captain_assignment.company_id = target_company_id
        and captain_assignment.confirmation_status <> 'cancelled'
        and captain_assignment.starts_on <= target_ends_on
        and captain_assignment.ends_on >= target_starts_on
        and (
          captain_assignment.crew_person_id = public.current_person_id()
          or captain_assignment.captain_person_id = public.current_person_id()
        )
        and (
          crew_assignment.crew_person_id = target_person_id
          or crew_assignment.captain_person_id = target_person_id
        )
        and (target_vessel_id is null or crew_assignment.vessel_id = target_vessel_id)
        and (
          target_watch_group is null
          or lower(trim(coalesce(crew_assignment.watch_group, ''))) = lower(trim(target_watch_group))
        )
        and exists (
          select 1
          from public.planning_publications publication
          where publication.published_at is not null
            and publication.current_version > 0
            and publication.starts_on <= target_ends_on
            and publication.ends_on >= target_starts_on
            and (publication.vessel_id is null or publication.vessel_id = crew_assignment.vessel_id)
        )
    );
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
        (
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

create or replace function public.working_time_can_comment_register(
  target_register_id bigint,
  target_local_date date
)
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
      and register.status in ('draft', 'reopened', 'submitted')
      and target_local_date between register.period_start and register.period_end
      and public.working_time_captain_can_access_period(
        register.company_id,
        register.person_id,
        target_local_date,
        target_local_date
      )
  );
$$;

-- The original generic trigger referenced interval-only fields from a boolean
-- expression, which PostgreSQL still resolves for day-comment rows. Keep each
-- table-specific field access inside its own runtime branch.
create or replace function public.working_time_enforce_company_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_register public.working_time_registers%rowtype;
begin
  if not exists (
    select 1 from public.people person
    where person.id = new.person_id and person.company_id = new.company_id
  ) then
    raise exception using errcode = '23514', message = 'WORKING_TIME_COMPANY_MISMATCH: personne.';
  end if;

  if tg_table_name = 'working_time_registers' then
    if new.work_rest_policy_id is not null and not exists (
      select 1 from public.planning_work_rest_policies policy
      where policy.id = new.work_rest_policy_id and policy.company_id = new.company_id
    ) then
      raise exception using errcode = '23514', message = 'WORKING_TIME_COMPANY_MISMATCH: politique.';
    end if;
  elsif tg_table_name = 'working_time_intervals' then
    select * into target_register from public.working_time_registers where id = new.register_id;
    if target_register.id is null
      or target_register.company_id <> new.company_id
      or target_register.person_id <> new.person_id
      or new.local_work_date not between target_register.period_start and target_register.period_end then
      raise exception using errcode = '23514', message = 'WORKING_TIME_REGISTER_MISMATCH: période ou personne.';
    end if;
    if new.vessel_id is not null and not exists (
      select 1 from public.vessels vessel
      where vessel.id = new.vessel_id and vessel.company_id = new.company_id
    ) then
      raise exception using errcode = '23514', message = 'WORKING_TIME_COMPANY_MISMATCH: navire.';
    end if;
  elsif tg_table_name = 'working_time_day_comments' then
    select * into target_register from public.working_time_registers where id = new.register_id;
    if target_register.id is null
      or target_register.company_id <> new.company_id
      or target_register.person_id <> new.person_id
      or new.local_work_date not between target_register.period_start and target_register.period_end then
      raise exception using errcode = '23514', message = 'WORKING_TIME_REGISTER_MISMATCH: période ou personne.';
    end if;
  elsif tg_table_name = 'working_time_validations' then
    select * into target_register from public.working_time_registers where id = new.register_id;
    if target_register.id is null
      or target_register.company_id <> new.company_id
      or target_register.person_id <> new.person_id then
      raise exception using errcode = '23514', message = 'WORKING_TIME_REGISTER_MISMATCH: validation.';
    end if;
    if new.actor_person_id is not null and not exists (
      select 1 from public.people person
      where person.id = new.actor_person_id and person.company_id = new.company_id
    ) then
      raise exception using errcode = '23514', message = 'WORKING_TIME_COMPANY_MISMATCH: validateur.';
    end if;
    if new.signature_version_id is not null and not exists (
      select 1 from public.working_time_profile_signatures signature
      where signature.id = new.signature_version_id
        and signature.company_id = new.company_id
        and signature.person_id = new.actor_person_id
    ) then
      raise exception using errcode = '23514', message = 'WORKING_TIME_SIGNATURE_MISMATCH: validateur.';
    end if;
  end if;
  return new;
end;
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
      (
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
    (
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

  if actor_person_id <> target_register.person_id and not public.working_time_captain_can_access_period(
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
    if actor_person_id <> target_register.person_id and not public.working_time_captain_can_access_period(
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
  if actor_person_id <> target_register.person_id and not public.working_time_captain_can_access_period(
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

create or replace function public.save_working_time_day_comment(
  p_register_id bigint,
  p_local_work_date date,
  p_comment text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_register public.working_time_registers%rowtype;
  saved_id bigint;
begin
  if length(trim(coalesce(p_comment, ''))) < 2 then
    raise exception using errcode = '22023', message = 'WORKING_TIME_COMMENT_REQUIRED.';
  end if;
  select * into target_register
  from public.working_time_registers register
  where register.id = p_register_id
  for update;
  if target_register.id is null or not public.working_time_can_comment_register(
    target_register.id, p_local_work_date
  ) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: commentaire capitaine.';
  end if;
  if not exists (
    select 1 from public.working_time_calculation_windows calculation
    where calculation.company_id = target_register.company_id
      and calculation.person_id = target_register.person_id
      and calculation.local_window_end_date = p_local_work_date
      and calculation.is_compliant is false
  ) then
    raise exception using errcode = '22023', message = 'WORKING_TIME_COMMENT_DAY_IS_COMPLIANT.';
  end if;

  insert into public.working_time_day_comments (
    company_id, register_id, person_id, local_work_date, comment,
    authored_by, authored_by_person_id
  ) values (
    target_register.company_id, target_register.id, target_register.person_id,
    p_local_work_date, trim(p_comment), auth.uid(), public.current_person_id()
  )
  on conflict (register_id, local_work_date) do update
  set comment = excluded.comment,
      authored_by = excluded.authored_by,
      authored_by_person_id = excluded.authored_by_person_id,
      updated_at = now()
  returning id into saved_id;
  return saved_id;
end;
$$;

create or replace function public.working_time_guard_register_lock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_register_id bigint := case when tg_op = 'DELETE' then old.register_id else new.register_id end;
  target_status text;
begin
  select register.status into target_status
  from public.working_time_registers register
  where register.id = target_register_id;
  if target_status = 'validated' then
    raise exception using errcode = '55000', message = 'WORKING_TIME_REGISTER_LOCKED.';
  end if;
  if tg_table_name = 'working_time_intervals' and target_status not in ('draft', 'reopened') then
    raise exception using errcode = '55000', message = 'WORKING_TIME_REGISTER_NOT_EDITABLE.';
  end if;
  if tg_table_name = 'working_time_day_comments' and target_status not in ('draft', 'reopened', 'submitted') then
    raise exception using errcode = '55000', message = 'WORKING_TIME_REGISTER_NOT_COMMENTABLE.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger working_time_intervals_05_register_lock
before insert or update or delete on public.working_time_intervals
for each row execute function public.working_time_guard_register_lock();

create trigger working_time_day_comments_05_register_lock
before insert or update or delete on public.working_time_day_comments
for each row execute function public.working_time_guard_register_lock();

create or replace function public.transition_working_time_register(
  p_register_id bigint,
  p_action text,
  p_comment text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_register public.working_time_registers%rowtype;
  subject_person public.people%rowtype;
  actor_person public.people%rowtype;
  actor_signature public.working_time_profile_signatures%rowtype;
  target_status text;
  event_name text;
  subject_identity jsonb;
  actor_identity jsonb;
  signature_data jsonb;
  vessels_data jsonb;
  watches_data jsonb;
  policy_data jsonb;
  saved_id bigint;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: authentification requise.';
  end if;

  select * into target_register from public.working_time_registers where id = p_register_id for update;
  if target_register.id is null or not public.user_belongs_to_company(target_register.company_id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: registre.';
  end if;
  select * into subject_person from public.people where id = target_register.person_id;
  select * into actor_person from public.people where user_id = auth.uid() and company_id = target_register.company_id limit 1;
  if actor_person.id is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PROFILE_NOT_LINKED: fiche RH requise.';
  end if;

  if p_action = 'request_sailor_signature'
    and target_register.status in ('draft', 'reopened') then
    if not (
      (
        actor_person.id = target_register.person_id
        and public.has_company_role(target_register.company_id, array['marin', 'capitaine'])
      )
      or public.has_company_role(target_register.company_id, array['admin', 'armement'])
      or public.working_time_captain_can_access_period(
        target_register.company_id, target_register.person_id,
        target_register.period_start, target_register.period_end
      )
    ) then
      raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: demande de signature.';
    end if;
    if not exists (
      select 1 from public.working_time_intervals work_interval
      where work_interval.register_id = target_register.id and work_interval.voided_at is null
    ) then
      raise exception using errcode = '23514', message = 'WORKING_TIME_EMPTY_REGISTER.';
    end if;
    target_status := 'awaiting_sailor_signature';
    event_name := 'signature_requested';
  elsif p_action = 'sailor_sign'
    and target_register.status = 'awaiting_sailor_signature' then
    if actor_person.id <> target_register.person_id then
      raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: signature du marin.';
    end if;
    if not public.has_company_role(target_register.company_id, array['marin', 'capitaine']) then
      raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: profil marin ou capitaine requis.';
    end if;
    target_status := 'submitted';
    event_name := 'sailor_signed';
  elsif p_action = 'captain_validate'
    and target_register.status = 'submitted' then
    if actor_person.id = target_register.person_id then
      raise exception using errcode = '42501', message = 'WORKING_TIME_SELF_VALIDATION_FORBIDDEN.';
    end if;
    if not public.has_company_role(target_register.company_id, array['admin', 'armement'])
      and not public.working_time_captain_can_access_period(
        target_register.company_id, target_register.person_id,
        target_register.period_start, target_register.period_end
      ) then
      raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: validation.';
    end if;
    if public.has_company_role(target_register.company_id, array['capitaine'])
      and not public.has_company_role(target_register.company_id, array['admin', 'armement'])
      and exists (
        select 1
        from public.working_time_intervals work_interval
        where work_interval.register_id = target_register.id
          and work_interval.voided_at is null
          and not public.working_time_captain_can_access_period(
            target_register.company_id, target_register.person_id,
            work_interval.local_work_date, work_interval.local_work_date,
            work_interval.vessel_id, work_interval.watch_group
          )
      ) then
      raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: période hors bordée publiée.';
    end if;
    if exists (
      select 1
      from (
        select distinct calculation.local_window_end_date
        from public.working_time_calculation_windows calculation
        where calculation.company_id = target_register.company_id
          and calculation.person_id = target_register.person_id
          and calculation.local_window_end_date between target_register.period_start and target_register.period_end
          and calculation.is_compliant is false
      ) non_compliant_day
      where not exists (
        select 1
        from public.working_time_day_comments day_comment
        join public.user_roles captain_role
          on captain_role.user_id = day_comment.authored_by
         and captain_role.company_id = target_register.company_id
         and captain_role.role_key = 'capitaine'
        where day_comment.register_id = target_register.id
          and day_comment.local_work_date = non_compliant_day.local_window_end_date
          and length(trim(day_comment.comment)) >= 2
      )
    ) then
      raise exception using errcode = '23514', message = 'WORKING_TIME_NON_COMPLIANT_COMMENT_REQUIRED.';
    end if;
    target_status := 'validated';
    event_name := 'captain_validated';
  elsif p_action = 'reopen'
    and target_register.status in ('awaiting_sailor_signature', 'submitted', 'validated') then
    if length(trim(coalesce(p_comment, ''))) < 2 then
      raise exception using errcode = '22023', message = 'WORKING_TIME_REOPEN_COMMENT_REQUIRED.';
    end if;
    if not public.has_company_role(target_register.company_id, array['admin', 'armement'])
      and not public.working_time_captain_can_access_period(
        target_register.company_id, target_register.person_id,
        target_register.period_start, target_register.period_end
      ) then
      raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: réouverture.';
    end if;
    target_status := 'reopened';
    event_name := 'reopened';
  else
    raise exception using errcode = '22023', message = 'WORKING_TIME_INVALID_TRANSITION.';
  end if;

  if event_name in ('sailor_signed', 'captain_validated') then
    select * into actor_signature
    from public.working_time_profile_signatures signature
    where signature.company_id = target_register.company_id
      and signature.person_id = actor_person.id
      and signature.valid_to is null
    order by signature.version_number desc
    limit 1;
    if actor_signature.id is null then
      raise exception using errcode = '23514', message = 'WORKING_TIME_ACTIVE_SIGNATURE_REQUIRED.';
    end if;
    signature_data := jsonb_build_object(
      'signature_id', actor_signature.id,
      'version_number', actor_signature.version_number,
      'storage_bucket', actor_signature.storage_bucket,
      'storage_path', actor_signature.storage_path,
      'mime_type', actor_signature.mime_type,
      'file_size_bytes', actor_signature.file_size_bytes,
      'sha256', actor_signature.sha256,
      'valid_from', actor_signature.valid_from
    );
  end if;

  subject_identity := jsonb_build_object(
    'person_id', subject_person.id, 'user_id', subject_person.user_id,
    'first_name', subject_person.first_name, 'last_name', subject_person.last_name,
    'email', subject_person.email, 'function_label', subject_person.function_label,
    'grade_label', subject_person.grade_label, 'sailor_number', subject_person.sailor_number
  );
  actor_identity := jsonb_build_object(
    'person_id', actor_person.id, 'user_id', actor_person.user_id,
    'first_name', actor_person.first_name, 'last_name', actor_person.last_name,
    'email', actor_person.email, 'function_label', actor_person.function_label,
    'grade_label', actor_person.grade_label, 'sailor_number', actor_person.sailor_number
  );

  select coalesce(jsonb_agg(item order by item->>'name'), '[]'::jsonb) into vessels_data
  from (
    select distinct jsonb_build_object('vessel_id', vessel.id, 'name', vessel.name, 'acronym', vessel.acronym) as item
    from public.working_time_intervals work_interval
    join public.vessels vessel on vessel.id = work_interval.vessel_id
    where work_interval.register_id = target_register.id and work_interval.voided_at is null
  ) vessels;
  select coalesce(jsonb_agg(watch_group order by watch_group), '[]'::jsonb) into watches_data
  from (
    select distinct trim(work_interval.watch_group) as watch_group
    from public.working_time_intervals work_interval
    where work_interval.register_id = target_register.id
      and work_interval.voided_at is null
      and nullif(trim(work_interval.watch_group), '') is not null
  ) watches;
  select jsonb_build_object(
    'policy_id', policy.id, 'name', policy.name, 'scope', policy.scope,
    'vessel_id', policy.vessel_id, 'effective_from', policy.effective_from,
    'effective_to', policy.effective_to, 'max_work_24h', policy.max_work_24h,
    'min_rest_24h', policy.min_rest_24h, 'max_work_7d', policy.max_work_7d,
    'min_rest_7d', policy.min_rest_7d,
    'min_consecutive_rest_hours', policy.min_consecutive_rest_hours,
    'max_rest_periods_24h', policy.max_rest_periods_24h,
    'night_starts_at', policy.night_starts_at, 'night_ends_at', policy.night_ends_at,
    'max_night_work_24h', policy.max_night_work_24h, 'include_handover', policy.include_handover
  ) into policy_data
  from public.planning_work_rest_policies policy
  where policy.id = target_register.work_rest_policy_id;

  insert into public.working_time_validations (
    company_id, register_id, person_id, event_type, previous_status, new_status,
    actor_user_id, actor_person_id, signature_version_id,
    subject_identity_snapshot, actor_identity_snapshot, signature_snapshot,
    vessel_snapshot, watch_snapshot, policy_snapshot, comment
  ) values (
    target_register.company_id, target_register.id, target_register.person_id,
    event_name, target_register.status, target_status,
    auth.uid(), actor_person.id, actor_signature.id,
    subject_identity, actor_identity, signature_data,
    vessels_data, watches_data, policy_data, nullif(trim(coalesce(p_comment, '')), '')
  ) returning id into saved_id;

  update public.working_time_registers
  set status = target_status, updated_at = now(), updated_by = auth.uid()
  where id = target_register.id;
  return saved_id;
end;
$$;

revoke all on function public.working_time_guard_register_lock() from public, anon, authenticated;
revoke all on function public.working_time_can_edit_register(bigint) from public, anon;
revoke all on function public.working_time_can_comment_register(bigint, date) from public, anon;
revoke all on function public.working_time_entry_context(date, date) from public, anon;
revoke all on function public.get_or_create_working_time_register(bigint, text, date) from public, anon;
revoke all on function public.save_working_time_interval(bigint, timestamptz, timestamptz, text, bigint, text, text, bigint) from public, anon;
revoke all on function public.void_working_time_interval(bigint, text) from public, anon;
revoke all on function public.save_working_time_day_comment(bigint, date, text) from public, anon;
revoke all on function public.transition_working_time_register(bigint, text, text) from public, anon;

grant execute on function public.working_time_can_edit_register(bigint) to authenticated;
grant execute on function public.working_time_can_comment_register(bigint, date) to authenticated;
grant execute on function public.working_time_entry_context(date, date) to authenticated;
grant execute on function public.get_or_create_working_time_register(bigint, text, date) to authenticated;
grant execute on function public.save_working_time_interval(bigint, timestamptz, timestamptz, text, bigint, text, text, bigint) to authenticated;
grant execute on function public.void_working_time_interval(bigint, text) to authenticated;
grant execute on function public.save_working_time_day_comment(bigint, date, text) to authenticated;
grant execute on function public.transition_working_time_register(bigint, text, text) to authenticated;

create policy working_time_registers_insert_guard on public.working_time_registers
for insert to authenticated
with check (
  status = 'draft'
  and public.user_belongs_to_company(company_id)
  and (
    (
      person_id = public.current_person_id()
      and public.has_company_role(company_id, array['marin', 'capitaine'])
    )
    or public.working_time_captain_can_access_period(
      company_id, person_id, period_start, period_end
    )
  )
);
create policy working_time_registers_update_guard on public.working_time_registers
for update to authenticated
using ((select public.working_time_can_edit_register(id)))
with check ((select public.working_time_can_edit_register(id)));

create policy working_time_intervals_insert_guard on public.working_time_intervals
for insert to authenticated
with check ((select public.working_time_can_edit_register(register_id)));
create policy working_time_intervals_update_guard on public.working_time_intervals
for update to authenticated
using ((select public.working_time_can_edit_register(register_id)))
with check ((select public.working_time_can_edit_register(register_id)));
create policy working_time_intervals_delete_guard on public.working_time_intervals
for delete to authenticated
using ((select public.working_time_can_edit_register(register_id)));

create policy working_time_day_comments_insert_guard on public.working_time_day_comments
for insert to authenticated
with check ((select public.working_time_can_comment_register(register_id, local_work_date)));
create policy working_time_day_comments_update_guard on public.working_time_day_comments
for update to authenticated
using ((select public.working_time_can_comment_register(register_id, local_work_date)))
with check ((select public.working_time_can_comment_register(register_id, local_work_date)));

-- Direct browser writes stay unavailable: RPCs validate payloads, status,
-- published planning and the authenticated HR identity transactionally.
revoke insert, update, delete on public.working_time_registers from authenticated;
revoke insert, update, delete on public.working_time_intervals from authenticated;
revoke insert, update, delete on public.working_time_day_comments from authenticated;

comment on function public.working_time_entry_context(date, date) is
  'Returns the current HR person and people editable through a published Planning watch assignment.';
comment on function public.save_working_time_interval(bigint, timestamptz, timestamptz, text, bigint, text, text, bigint) is
  'Authoritative interval mutation RPC; server derives local date and UTC offset and rejects locked or out-of-watch writes.';
comment on function public.transition_working_time_register(bigint, text, text) is
  'Workflow RPC enforcing explicit profile signatures, separation of duties, captain comments and motivated reopening.';
