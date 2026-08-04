-- Working Time domain model.
-- Work intervals are the only source of truth for worked time. Registers group
-- intervals for workflow purposes; totals and compliance remain derived values.
-- Existing P1.3 thresholds remain in planning_work_rest_policies.

create extension if not exists btree_gist with schema extensions;

create table public.working_time_registers (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade
    default public.current_planning_company_id(),
  person_id bigint not null references public.people(id) on delete restrict,
  period_kind text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft',
  work_rest_policy_id bigint references public.planning_work_rest_policies(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  constraint working_time_registers_period_kind_check
    check (period_kind in ('weekly', 'monthly')),
  constraint working_time_registers_status_check
    check (status in ('draft', 'awaiting_sailor_signature', 'submitted', 'validated', 'reopened')),
  constraint working_time_registers_period_check check (
    (period_kind = 'weekly' and period_end = period_start + 6)
    or (
      period_kind = 'monthly'
      and period_start = date_trunc('month', period_start)::date
      and period_end = (date_trunc('month', period_start) + interval '1 month - 1 day')::date
    )
  ),
  constraint working_time_registers_unique_period
    unique (company_id, person_id, period_kind, period_start, period_end)
);

create table public.working_time_intervals (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade
    default public.current_planning_company_id(),
  register_id bigint not null references public.working_time_registers(id) on delete cascade,
  person_id bigint not null references public.people(id) on delete restrict,
  local_work_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone_name text not null,
  utc_offset_minutes smallint not null,
  vessel_id bigint references public.vessels(id) on delete restrict,
  watch_group text,
  comment text,
  author_user_id uuid references public.profiles(id) on delete set null default auth.uid(),
  author_person_id bigint references public.people(id) on delete set null default public.current_person_id(),
  source_type text not null default 'manual',
  source_reference text,
  source_record_key text,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  constraint working_time_intervals_dates_check check (ends_at > starts_at),
  constraint working_time_intervals_timezone_check check (length(trim(timezone_name)) between 1 and 100),
  constraint working_time_intervals_offset_check check (utc_offset_minutes between -840 and 840),
  constraint working_time_intervals_local_date_check
    check (local_work_date = (starts_at at time zone timezone_name)::date),
  constraint working_time_intervals_timezone_offset_check check (
    utc_offset_minutes = (
      extract(epoch from (
        (starts_at at time zone timezone_name) - (starts_at at time zone 'UTC')
      )) / 60
    )::integer
  ),
  constraint working_time_intervals_watch_check
    check (watch_group is null or length(trim(watch_group)) between 1 and 120),
  constraint working_time_intervals_comment_check
    check (comment is null or length(trim(comment)) between 1 and 4000),
  constraint working_time_intervals_source_check check (
    source_type in ('manual', 'excel_import', 'planning', 'sedentary_planning', 'migration', 'api')
  ),
  constraint working_time_intervals_manual_author_check check (
    source_type <> 'manual' or (author_user_id is not null and author_person_id is not null)
  ),
  constraint working_time_intervals_void_check check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and length(trim(void_reason)) between 2 and 1000)
  )
);

alter table public.working_time_intervals
  add constraint working_time_intervals_no_overlap
  exclude using gist (
    person_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (voided_at is null);

create unique index working_time_intervals_source_record_uidx
  on public.working_time_intervals (company_id, source_type, source_record_key)
  where source_record_key is not null and voided_at is null;

create table public.working_time_day_comments (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade
    default public.current_planning_company_id(),
  register_id bigint not null references public.working_time_registers(id) on delete cascade,
  person_id bigint not null references public.people(id) on delete restrict,
  local_work_date date not null,
  comment text not null,
  authored_by uuid references public.profiles(id) on delete set null default auth.uid(),
  authored_by_person_id bigint references public.people(id) on delete set null default public.current_person_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint working_time_day_comments_text_check check (length(trim(comment)) between 2 and 4000),
  constraint working_time_day_comments_unique_day unique (register_id, local_work_date)
);

create table public.working_time_profile_signatures (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade
    default public.current_planning_company_id(),
  person_id bigint not null references public.people(id) on delete restrict,
  version_number integer not null,
  storage_bucket text not null default 'working-time-signatures',
  storage_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  sha256 text not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  revoked_by uuid references public.profiles(id) on delete set null,
  revocation_reason text,
  constraint working_time_profile_signatures_version_check check (version_number > 0),
  constraint working_time_profile_signatures_bucket_check check (storage_bucket = 'working-time-signatures'),
  constraint working_time_profile_signatures_path_check check (length(trim(storage_path)) between 3 and 500),
  constraint working_time_profile_signatures_mime_check
    check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  constraint working_time_profile_signatures_size_check check (file_size_bytes between 1 and 1048576),
  constraint working_time_profile_signatures_sha_check check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint working_time_profile_signatures_validity_check check (valid_to is null or valid_to >= valid_from),
  constraint working_time_profile_signatures_revocation_check check (
    (valid_to is null and revoked_by is null and revocation_reason is null)
    or (valid_to is not null and revoked_by is not null and length(trim(revocation_reason)) between 2 and 1000)
  ),
  constraint working_time_profile_signatures_unique_version unique (company_id, person_id, version_number),
  constraint working_time_profile_signatures_unique_object unique (storage_bucket, storage_path)
);

create unique index working_time_profile_signatures_current_uidx
  on public.working_time_profile_signatures (company_id, person_id)
  where valid_to is null;

create table public.working_time_validations (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  register_id bigint not null references public.working_time_registers(id) on delete restrict,
  person_id bigint not null references public.people(id) on delete restrict,
  event_type text not null,
  previous_status text not null,
  new_status text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_person_id bigint references public.people(id) on delete set null,
  signature_version_id bigint references public.working_time_profile_signatures(id) on delete restrict,
  subject_identity_snapshot jsonb not null,
  actor_identity_snapshot jsonb not null,
  signature_snapshot jsonb,
  vessel_snapshot jsonb not null default '[]'::jsonb,
  watch_snapshot jsonb not null default '[]'::jsonb,
  policy_snapshot jsonb,
  comment text,
  occurred_at timestamptz not null default now(),
  constraint working_time_validations_event_check check (
    event_type in ('signature_requested', 'sailor_signed', 'captain_validated', 'reopened')
  ),
  constraint working_time_validations_previous_status_check check (
    previous_status in ('draft', 'awaiting_sailor_signature', 'submitted', 'validated', 'reopened')
  ),
  constraint working_time_validations_new_status_check check (
    new_status in ('draft', 'awaiting_sailor_signature', 'submitted', 'validated', 'reopened')
  ),
  constraint working_time_validations_transition_check check (
    (event_type = 'signature_requested' and previous_status in ('draft', 'reopened') and new_status = 'awaiting_sailor_signature')
    or (event_type = 'sailor_signed' and previous_status = 'awaiting_sailor_signature' and new_status = 'submitted')
    or (event_type = 'captain_validated' and previous_status = 'submitted' and new_status = 'validated')
    or (event_type = 'reopened' and previous_status in ('awaiting_sailor_signature', 'submitted', 'validated') and new_status = 'reopened')
  ),
  constraint working_time_validations_snapshot_types_check check (
    jsonb_typeof(subject_identity_snapshot) = 'object'
    and jsonb_typeof(actor_identity_snapshot) = 'object'
    and (signature_snapshot is null or jsonb_typeof(signature_snapshot) = 'object')
    and jsonb_typeof(vessel_snapshot) = 'array'
    and jsonb_typeof(watch_snapshot) = 'array'
    and (policy_snapshot is null or jsonb_typeof(policy_snapshot) = 'object')
  ),
  constraint working_time_validations_signature_check check (
    (event_type in ('sailor_signed', 'captain_validated') and signature_version_id is not null and signature_snapshot is not null)
    or (event_type in ('signature_requested', 'reopened') and signature_version_id is null and signature_snapshot is null)
  ),
  constraint working_time_validations_reopen_comment_check check (
    event_type <> 'reopened' or length(trim(comment)) between 2 and 4000
  )
);

create table public.working_time_audit_events (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  register_id bigint references public.working_time_registers(id) on delete set null,
  person_id bigint references public.people(id) on delete set null,
  entity_kind text not null,
  entity_id bigint not null,
  action text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_person_id bigint references public.people(id) on delete set null,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now(),
  constraint working_time_audit_events_entity_check check (
    entity_kind in ('register', 'interval', 'day_comment', 'profile_signature', 'validation')
  ),
  constraint working_time_audit_events_action_check check (action in ('insert', 'update', 'delete')),
  constraint working_time_audit_events_payload_check check (before_data is not null or after_data is not null)
);

create index working_time_registers_person_period_idx
  on public.working_time_registers (company_id, person_id, period_start, period_end);
create index working_time_registers_status_idx
  on public.working_time_registers (company_id, status, period_end desc);
create index working_time_intervals_register_date_idx
  on public.working_time_intervals (register_id, local_work_date, starts_at) where voided_at is null;
create index working_time_intervals_person_date_idx
  on public.working_time_intervals (company_id, person_id, local_work_date, starts_at) where voided_at is null;
create index working_time_intervals_vessel_watch_idx
  on public.working_time_intervals (company_id, vessel_id, watch_group, local_work_date) where voided_at is null;
create index working_time_day_comments_register_date_idx
  on public.working_time_day_comments (register_id, local_work_date);
create index working_time_profile_signatures_person_idx
  on public.working_time_profile_signatures (company_id, person_id, version_number desc);
create index working_time_validations_register_idx
  on public.working_time_validations (register_id, occurred_at desc);
create index working_time_audit_events_register_idx
  on public.working_time_audit_events (register_id, occurred_at desc);
create index working_time_audit_events_entity_idx
  on public.working_time_audit_events (entity_kind, entity_id, occurred_at desc);

create or replace function public.working_time_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  if tg_table_name = 'working_time_registers' then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

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
  elsif tg_table_name in ('working_time_intervals', 'working_time_day_comments') then
    select * into target_register from public.working_time_registers where id = new.register_id;
    if target_register.id is null
      or target_register.company_id <> new.company_id
      or target_register.person_id <> new.person_id
      or new.local_work_date not between target_register.period_start and target_register.period_end then
      raise exception using errcode = '23514', message = 'WORKING_TIME_REGISTER_MISMATCH: période ou personne.';
    end if;
    if tg_table_name = 'working_time_intervals'
      and new.vessel_id is not null
      and not exists (
        select 1 from public.vessels vessel
        where vessel.id = new.vessel_id and vessel.company_id = new.company_id
      ) then
      raise exception using errcode = '23514', message = 'WORKING_TIME_COMPANY_MISMATCH: navire.';
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
      select 1
      from public.working_time_profile_signatures signature
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
    );
$$;

create or replace function public.working_time_can_read_register(target_register_id bigint)
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
      and public.user_belongs_to_company(register.company_id)
      and (
        register.person_id = public.current_person_id()
        or public.has_company_role(register.company_id, array['admin', 'direction', 'armement'])
        or public.working_time_captain_can_access_period(
          register.company_id,
          register.person_id,
          register.period_start,
          register.period_end
        )
      )
  );
$$;

create or replace function public.working_time_can_read_signature(target_signature_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.working_time_profile_signatures signature
    where signature.id = target_signature_id
      and public.user_belongs_to_company(signature.company_id)
      and (
        signature.person_id = public.current_person_id()
        or public.has_company_role(signature.company_id, array['admin', 'direction', 'armement'])
        or (
          public.has_company_role(signature.company_id, array['capitaine'])
          and public.captain_shares_watch_with_person(signature.company_id, signature.person_id)
        )
      )
  );
$$;

create or replace function public.working_time_can_upload_signature_object(
  target_bucket text,
  target_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage, pg_temp
as $$
declare
  path_parts text[] := string_to_array(target_path, '/');
  target_company_id bigint;
  target_person_id bigint;
begin
  if auth.uid() is null
    or target_bucket <> 'working-time-signatures'
    or cardinality(path_parts) <> 3
    or path_parts[1] !~ '^[0-9]+$'
    or path_parts[2] !~ '^[0-9]+$'
    or lower(split_part(path_parts[3], '.', -1)) not in ('png', 'jpg', 'jpeg', 'webp') then
    return false;
  end if;

  target_company_id := path_parts[1]::bigint;
  target_person_id := path_parts[2]::bigint;

  return public.user_belongs_to_company(target_company_id)
    and exists (
      select 1 from public.people person
      where person.id = target_person_id and person.company_id = target_company_id
    )
    and (
      target_person_id = public.current_person_id()
      or public.has_company_role(target_company_id, array['admin', 'direction', 'armement'])
    );
end;
$$;

create or replace function public.register_working_time_profile_signature(
  p_person_id bigint,
  p_storage_path text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_sha256 text
)
returns bigint
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  next_version integer;
  saved_id bigint;
begin
  if auth.uid() is null or target_company_id is null or not public.user_belongs_to_company(target_company_id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: signature.';
  end if;
  if not exists (
    select 1 from public.people person
    where person.id = p_person_id and person.company_id = target_company_id
  ) then
    raise exception using errcode = '23503', message = 'WORKING_TIME_PERSON_NOT_FOUND.';
  end if;
  if p_person_id <> public.current_person_id()
    and not public.has_company_role(target_company_id, array['admin', 'direction', 'armement']) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: signature d''un tiers.';
  end if;
  if not public.working_time_can_upload_signature_object('working-time-signatures', p_storage_path)
    or p_mime_type not in ('image/png', 'image/jpeg', 'image/webp')
    or p_file_size_bytes not between 1 and 1048576
    or lower(p_sha256) !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'WORKING_TIME_SIGNATURE_INVALID.';
  end if;
  if not exists (
    select 1 from storage.objects object
    where object.bucket_id = 'working-time-signatures' and object.name = p_storage_path
  ) then
    raise exception using errcode = '23514', message = 'WORKING_TIME_SIGNATURE_NOT_UPLOADED.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('working-time-signature:' || target_company_id || ':' || p_person_id, 0));

  update public.working_time_profile_signatures
  set valid_to = now(), revoked_by = auth.uid(), revocation_reason = 'Remplacée par une nouvelle version'
  where company_id = target_company_id and person_id = p_person_id and valid_to is null;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.working_time_profile_signatures
  where company_id = target_company_id and person_id = p_person_id;

  insert into public.working_time_profile_signatures (
    company_id, person_id, version_number, storage_path, mime_type, file_size_bytes, sha256, created_by
  ) values (
    target_company_id, p_person_id, next_version, trim(p_storage_path), p_mime_type,
    p_file_size_bytes, lower(p_sha256), auth.uid()
  ) returning id into saved_id;

  return saved_id;
end;
$$;

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
    if actor_person.id <> target_register.person_id
      and not public.has_company_role(target_register.company_id, array['admin', 'direction', 'armement'])
      and not public.working_time_captain_can_access_period(
        target_register.company_id, target_register.person_id,
        target_register.period_start, target_register.period_end
      ) then
      raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: demande de signature.';
    end if;
    target_status := 'awaiting_sailor_signature';
    event_name := 'signature_requested';
  elsif p_action = 'sailor_sign'
    and target_register.status = 'awaiting_sailor_signature' then
    if actor_person.id <> target_register.person_id then
      raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: signature du marin.';
    end if;
    target_status := 'submitted';
    event_name := 'sailor_signed';
  elsif p_action = 'captain_validate'
    and target_register.status = 'submitted' then
    if not public.working_time_captain_can_access_period(
      target_register.company_id, target_register.person_id,
      target_register.period_start, target_register.period_end
    ) then
      raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: validation capitaine.';
    end if;
    target_status := 'validated';
    event_name := 'captain_validated';
  elsif p_action = 'reopen'
    and target_register.status in ('awaiting_sailor_signature', 'submitted', 'validated') then
    if length(trim(coalesce(p_comment, ''))) < 2 then
      raise exception using errcode = '22023', message = 'WORKING_TIME_REOPEN_COMMENT_REQUIRED.';
    end if;
    if not public.has_company_role(target_register.company_id, array['admin', 'direction', 'armement'])
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
    'person_id', subject_person.id,
    'user_id', subject_person.user_id,
    'first_name', subject_person.first_name,
    'last_name', subject_person.last_name,
    'email', subject_person.email,
    'function_label', subject_person.function_label,
    'grade_label', subject_person.grade_label,
    'sailor_number', subject_person.sailor_number
  );
  actor_identity := jsonb_build_object(
    'person_id', actor_person.id,
    'user_id', actor_person.user_id,
    'first_name', actor_person.first_name,
    'last_name', actor_person.last_name,
    'email', actor_person.email,
    'function_label', actor_person.function_label,
    'grade_label', actor_person.grade_label,
    'sailor_number', actor_person.sailor_number
  );

  select coalesce(jsonb_agg(item order by item->>'name'), '[]'::jsonb) into vessels_data
  from (
    select distinct jsonb_build_object(
      'vessel_id', vessel.id,
      'name', vessel.name,
      'acronym', vessel.acronym
    ) as item
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
    'policy_id', policy.id,
    'name', policy.name,
    'scope', policy.scope,
    'vessel_id', policy.vessel_id,
    'effective_from', policy.effective_from,
    'effective_to', policy.effective_to,
    'max_work_24h', policy.max_work_24h,
    'min_rest_24h', policy.min_rest_24h,
    'max_work_7d', policy.max_work_7d,
    'min_rest_7d', policy.min_rest_7d,
    'min_consecutive_rest_hours', policy.min_consecutive_rest_hours,
    'max_rest_periods_24h', policy.max_rest_periods_24h,
    'night_starts_at', policy.night_starts_at,
    'night_ends_at', policy.night_ends_at,
    'max_night_work_24h', policy.max_night_work_24h,
    'include_handover', policy.include_handover
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

create or replace function public.working_time_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_company_id bigint := (row_data->>'company_id')::bigint;
  target_register_id bigint;
  target_person_id bigint;
  target_entity_kind text;
begin
  target_entity_kind := case tg_table_name
    when 'working_time_registers' then 'register'
    when 'working_time_intervals' then 'interval'
    when 'working_time_day_comments' then 'day_comment'
    when 'working_time_profile_signatures' then 'profile_signature'
    when 'working_time_validations' then 'validation'
  end;
  target_register_id := case
    when tg_table_name = 'working_time_registers' then (row_data->>'id')::bigint
    when row_data ? 'register_id' then (row_data->>'register_id')::bigint
    else null
  end;
  target_person_id := (row_data->>'person_id')::bigint;

  insert into public.working_time_audit_events (
    company_id, register_id, person_id, entity_kind, entity_id, action,
    actor_user_id, actor_person_id, before_data, after_data
  ) values (
    target_company_id, target_register_id, target_person_id, target_entity_kind,
    (row_data->>'id')::bigint, lower(tg_op), auth.uid(), public.current_person_id(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.working_time_prevent_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception using errcode = '55000', message = 'WORKING_TIME_IMMUTABLE_HISTORY.';
end;
$$;

revoke all on function public.working_time_set_updated_at() from public, anon, authenticated;
revoke all on function public.working_time_enforce_company_scope() from public, anon, authenticated;
revoke all on function public.working_time_audit_row() from public, anon, authenticated;
revoke all on function public.working_time_prevent_mutation() from public, anon, authenticated;
revoke all on function public.working_time_captain_can_access_period(bigint, bigint, date, date, bigint, text) from public, anon;
revoke all on function public.working_time_can_read_register(bigint) from public, anon;
revoke all on function public.working_time_can_read_signature(bigint) from public, anon;
revoke all on function public.working_time_can_upload_signature_object(text, text) from public, anon;
revoke all on function public.register_working_time_profile_signature(bigint, text, text, bigint, text) from public, anon;
revoke all on function public.transition_working_time_register(bigint, text, text) from public, anon;

grant execute on function public.working_time_captain_can_access_period(bigint, bigint, date, date, bigint, text) to authenticated;
grant execute on function public.working_time_can_read_register(bigint) to authenticated;
grant execute on function public.working_time_can_read_signature(bigint) to authenticated;
grant execute on function public.working_time_can_upload_signature_object(text, text) to authenticated;
grant execute on function public.register_working_time_profile_signature(bigint, text, text, bigint, text) to authenticated;
grant execute on function public.transition_working_time_register(bigint, text, text) to authenticated;

create trigger working_time_registers_set_updated_at
before update on public.working_time_registers
for each row execute function public.working_time_set_updated_at();
create trigger working_time_intervals_set_updated_at
before update on public.working_time_intervals
for each row execute function public.working_time_set_updated_at();
create trigger working_time_day_comments_set_updated_at
before update on public.working_time_day_comments
for each row execute function public.working_time_set_updated_at();

create trigger working_time_registers_company_scope
before insert or update on public.working_time_registers
for each row execute function public.working_time_enforce_company_scope();
create trigger working_time_intervals_company_scope
before insert or update on public.working_time_intervals
for each row execute function public.working_time_enforce_company_scope();
create trigger working_time_day_comments_company_scope
before insert or update on public.working_time_day_comments
for each row execute function public.working_time_enforce_company_scope();
create trigger working_time_profile_signatures_company_scope
before insert or update on public.working_time_profile_signatures
for each row execute function public.working_time_enforce_company_scope();
create trigger working_time_validations_company_scope
before insert on public.working_time_validations
for each row execute function public.working_time_enforce_company_scope();

create trigger working_time_registers_audit
after insert or update or delete on public.working_time_registers
for each row execute function public.working_time_audit_row();
create trigger working_time_intervals_audit
after insert or update or delete on public.working_time_intervals
for each row execute function public.working_time_audit_row();
create trigger working_time_day_comments_audit
after insert or update or delete on public.working_time_day_comments
for each row execute function public.working_time_audit_row();
create trigger working_time_profile_signatures_audit
after insert or update or delete on public.working_time_profile_signatures
for each row execute function public.working_time_audit_row();
create trigger working_time_validations_audit
after insert on public.working_time_validations
for each row execute function public.working_time_audit_row();

create trigger working_time_validations_immutable
before update or delete on public.working_time_validations
for each row execute function public.working_time_prevent_mutation();
create trigger working_time_audit_events_immutable
before update or delete on public.working_time_audit_events
for each row execute function public.working_time_prevent_mutation();

alter table public.working_time_registers enable row level security;
alter table public.working_time_intervals enable row level security;
alter table public.working_time_day_comments enable row level security;
alter table public.working_time_profile_signatures enable row level security;
alter table public.working_time_validations enable row level security;
alter table public.working_time_audit_events enable row level security;

create policy working_time_registers_read on public.working_time_registers
for select to authenticated
using ((select public.working_time_can_read_register(id)));

create policy working_time_intervals_read on public.working_time_intervals
for select to authenticated
using ((select public.working_time_can_read_register(register_id)));

create policy working_time_day_comments_read on public.working_time_day_comments
for select to authenticated
using ((select public.working_time_can_read_register(register_id)));

create policy working_time_profile_signatures_read on public.working_time_profile_signatures
for select to authenticated
using ((select public.working_time_can_read_signature(id)));

create policy working_time_validations_read on public.working_time_validations
for select to authenticated
using ((select public.working_time_can_read_register(register_id)));

create policy working_time_audit_events_read on public.working_time_audit_events
for select to authenticated
using (
  (register_id is not null and (select public.working_time_can_read_register(register_id)))
  or (
    register_id is null
    and public.user_belongs_to_company(company_id)
    and (
      person_id = public.current_person_id()
      or public.has_company_role(company_id, array['admin', 'direction', 'armement'])
      or (
        public.has_company_role(company_id, array['capitaine'])
        and public.captain_shares_watch_with_person(company_id, person_id)
      )
    )
  )
);

revoke all on table public.working_time_registers from anon, authenticated;
revoke all on table public.working_time_intervals from anon, authenticated;
revoke all on table public.working_time_day_comments from anon, authenticated;
revoke all on table public.working_time_profile_signatures from anon, authenticated;
revoke all on table public.working_time_validations from anon, authenticated;
revoke all on table public.working_time_audit_events from anon, authenticated;
grant select on table public.working_time_registers to authenticated;
grant select on table public.working_time_intervals to authenticated;
grant select on table public.working_time_day_comments to authenticated;
grant select on table public.working_time_profile_signatures to authenticated;
grant select on table public.working_time_validations to authenticated;
grant select on table public.working_time_audit_events to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'working-time-signatures',
  'working-time-signatures',
  false,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy working_time_signatures_storage_read on storage.objects
for select to authenticated
using (
  bucket_id = 'working-time-signatures'
  and exists (
    select 1
    from public.working_time_profile_signatures signature
    where signature.storage_bucket = storage.objects.bucket_id
      and signature.storage_path = storage.objects.name
      and public.working_time_can_read_signature(signature.id)
  )
);

create policy working_time_signatures_storage_insert on storage.objects
for insert to authenticated
with check (public.working_time_can_upload_signature_object(bucket_id, name));

comment on table public.working_time_registers is
  'Weekly or monthly workflow envelope. Worked-time totals are derived from working_time_intervals.';
comment on table public.working_time_intervals is
  'Canonical source of truth for worked time, with local date, absolute timestamps, timezone/offset and import provenance.';
comment on table public.working_time_day_comments is
  'Captain-authored explanations for daily non-conformities; compliance itself remains derived from intervals and P1.3 policies.';
comment on table public.working_time_profile_signatures is
  'Immutable, versioned profile-signature metadata. Replaced assets remain stored for historical validation snapshots.';
comment on table public.working_time_validations is
  'Append-only workflow events with frozen signature, identity, vessel, watch and P1.3 policy snapshots.';
comment on table public.working_time_audit_events is
  'Append-only row history for every working-time business record.';
