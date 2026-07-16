-- Replace period-based planning publication with immutable global releases.
-- Office roles keep editing the live planning; captains and sailors read the
-- latest released snapshot through a role-filtered RPC.

create table if not exists public.planning_releases (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  snapshot jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid not null references public.profiles(id) on delete restrict,
  published_by_name text not null,
  unique (company_id, version_number)
);

create index if not exists planning_releases_company_version_idx
  on public.planning_releases (company_id, version_number desc);

alter table public.planning_releases enable row level security;
revoke all on table public.planning_releases from anon, authenticated;
revoke all on sequence public.planning_releases_id_seq from anon, authenticated;

create or replace function public.reject_planning_release_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'PLANNING_RELEASE_IMMUTABLE';
end;
$$;

drop trigger if exists planning_releases_immutable on public.planning_releases;
create trigger planning_releases_immutable
before update or delete on public.planning_releases
for each row execute function public.reject_planning_release_mutation();

delete from public.planning_action_permissions
where action_key in ('submit', 'validate', 'reopen', 'archive');

insert into public.planning_action_permissions (role_key, action_key, scope_mode)
values
  ('admin', 'publish', 'company'),
  ('direction', 'publish', 'company'),
  ('armement', 'publish', 'company')
on conflict (role_key, action_key) do update
set scope_mode = excluded.scope_mode;

update public.planning_publications
set locked_at = null,
    locked_by = null
where locked_at is not null;

create or replace function public.planning_scope_is_locked(
  target_starts_on date,
  target_ends_on date,
  target_vessel_id bigint,
  target_company_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select false;
$$;

create or replace function public.planning_scope_is_locked(
  target_starts_on date,
  target_ends_on date,
  target_vessel_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select false;
$$;

revoke execute on function public.transition_planning_publication(text, bigint, date, date, bigint, text)
  from anon, authenticated;

create or replace function public.planning_release_snapshot(target_company_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'scope', jsonb_build_object('company_id', target_company_id),
    'assignments', coalesce((
      select jsonb_agg(to_jsonb(assignment_row) order by assignment_row.id)
      from (
        select
          assignment.id,
          assignment.vessel_id,
          vessel.name as vessel_name,
          assignment.captain_person_id,
          nullif(trim(concat_ws(' ', captain.first_name, captain.last_name)), '') as captain_name,
          assignment.crew_person_id,
          nullif(trim(concat_ws(' ', crew.first_name, crew.last_name)), '') as crew_name,
          assignment.starts_on,
          assignment.ends_on,
          assignment.starts_at,
          assignment.ends_at,
          assignment.assignment_role,
          assignment.status_label,
          assignment.confirmation_status,
          assignment.watch_group,
          assignment.comments,
          assignment.source_label
        from public.planning_assignments assignment
        left join public.vessels vessel
          on vessel.id = assignment.vessel_id
         and vessel.company_id = assignment.company_id
        left join public.people captain
          on captain.id = assignment.captain_person_id
         and captain.company_id = assignment.company_id
        left join public.people crew
          on crew.id = assignment.crew_person_id
         and crew.company_id = assignment.company_id
        where assignment.company_id = target_company_id
      ) assignment_row
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(to_jsonb(day_record) order by day_record.id)
      from public.planning_days day_record
      where day_record.company_id = target_company_id
    ), '[]'::jsonb),
    'periods', coalesce((
      select jsonb_agg(to_jsonb(period_record) order by period_record.id)
      from public.planning_periods period_record
      where period_record.company_id = target_company_id
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(to_jsonb(project) order by project.id)
      from public.planning_projects project
      where project.company_id = target_company_id
    ), '[]'::jsonb),
    'handovers', coalesce((
      select jsonb_agg(
        to_jsonb(handover) || jsonb_build_object(
          'positions', coalesce((
            select jsonb_agg(to_jsonb(position) order by position.position_order, position.id)
            from public.planning_handover_positions position
            where position.handover_id = handover.id
          ), '[]'::jsonb)
        )
        order by handover.handover_at, handover.id
      )
      from public.planning_handovers handover
      where handover.company_id = target_company_id
    ), '[]'::jsonb),
    'derogations', coalesce((
      select jsonb_agg(to_jsonb(derogation) order by derogation.id)
      from public.planning_derogations derogation
      where derogation.company_id = target_company_id
    ), '[]'::jsonb)
  );
$$;

create or replace function public.planning_visible_release_snapshot(target_snapshot jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := nullif(target_snapshot #>> '{scope,company_id}', '')::bigint;
  target_person_id bigint := public.current_person_id();
  office_role boolean := public.has_any_role(array['admin', 'direction', 'armement']);
  captain_role boolean := public.has_role('capitaine');
  allowed_vessel_ids bigint[] := '{}'::bigint[];
  visible_assignments jsonb := '[]'::jsonb;
  visible_days jsonb := '[]'::jsonb;
  visible_periods jsonb := '[]'::jsonb;
  visible_projects jsonb := '[]'::jsonb;
  visible_handovers jsonb := '[]'::jsonb;
  visible_derogations jsonb := '[]'::jsonb;
begin
  if target_company_id is null
    or target_company_id is distinct from public.current_planning_company_id()
    or not public.user_belongs_to_company(target_company_id) then
    raise exception using
      errcode = '42501',
      message = 'PLANNING_PERMISSION_DENIED: diffusion du planning.';
  end if;

  if office_role then
    return target_snapshot;
  end if;

  if target_person_id is null then
    return target_snapshot || jsonb_build_object(
      'assignments', '[]'::jsonb,
      'days', '[]'::jsonb,
      'periods', '[]'::jsonb,
      'projects', '[]'::jsonb,
      'handovers', '[]'::jsonb,
      'derogations', '[]'::jsonb
    );
  end if;

  select coalesce(array_agg(distinct (item ->> 'vessel_id')::bigint), '{}'::bigint[])
  into allowed_vessel_ids
  from jsonb_array_elements(coalesce(target_snapshot -> 'assignments', '[]'::jsonb)) item
  where (item ->> 'crew_person_id')::bigint = target_person_id
     or (captain_role and nullif(item ->> 'captain_person_id', '')::bigint = target_person_id);

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into visible_assignments
  from jsonb_array_elements(coalesce(target_snapshot -> 'assignments', '[]'::jsonb)) item
  where case
    when captain_role then (item ->> 'vessel_id')::bigint = any(allowed_vessel_ids)
    else (item ->> 'crew_person_id')::bigint = target_person_id
  end;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into visible_days
  from jsonb_array_elements(coalesce(target_snapshot -> 'days', '[]'::jsonb)) item
  where case
    when captain_role then nullif(item ->> 'vessel_id', '')::bigint = any(allowed_vessel_ids)
    else nullif(item ->> 'person_id', '')::bigint = target_person_id
  end;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into visible_periods
  from jsonb_array_elements(coalesce(target_snapshot -> 'periods', '[]'::jsonb)) item
  where case
    when captain_role then nullif(item ->> 'vessel_id', '')::bigint = any(allowed_vessel_ids)
    else nullif(item ->> 'person_id', '')::bigint = target_person_id
  end;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into visible_projects
  from jsonb_array_elements(coalesce(target_snapshot -> 'projects', '[]'::jsonb)) item
  where nullif(item ->> 'primary_vessel_id', '')::bigint = any(allowed_vessel_ids)
     or nullif(item ->> 'secondary_vessel_id', '')::bigint = any(allowed_vessel_ids);

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into visible_handovers
  from jsonb_array_elements(coalesce(target_snapshot -> 'handovers', '[]'::jsonb)) item
  where nullif(item ->> 'vessel_id', '')::bigint = any(allowed_vessel_ids);

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into visible_derogations
  from jsonb_array_elements(coalesce(target_snapshot -> 'derogations', '[]'::jsonb)) item
  where nullif(item ->> 'person_id', '')::bigint = target_person_id
     or (captain_role and nullif(item ->> 'vessel_id', '')::bigint = any(allowed_vessel_ids));

  return target_snapshot || jsonb_build_object(
    'assignments', visible_assignments,
    'days', visible_days,
    'periods', visible_periods,
    'projects', visible_projects,
    'handovers', visible_handovers,
    'derogations', visible_derogations
  );
end;
$$;

create or replace function public.planning_release_history()
returns table (
  id bigint,
  publication_id bigint,
  version_number integer,
  comment text,
  created_at timestamptz,
  created_by uuid,
  created_by_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
begin
  if target_company_id is null
    or not public.user_belongs_to_company(target_company_id)
    or not public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']) then
    raise exception using
      errcode = '42501',
      message = 'PLANNING_PERMISSION_DENIED: historique des diffusions.';
  end if;

  return query
  select
    release.id,
    release.id,
    release.version_number,
    ''::text,
    release.published_at,
    release.published_by,
    release.published_by_name
  from public.planning_releases release
  where release.company_id = target_company_id
  order by release.version_number desc;
end;
$$;

create or replace function public.latest_planning_release()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_release public.planning_releases%rowtype;
begin
  if target_company_id is null
    or not public.user_belongs_to_company(target_company_id)
    or not public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']) then
    raise exception using
      errcode = '42501',
      message = 'PLANNING_PERMISSION_DENIED: dernière diffusion.';
  end if;

  select *
  into target_release
  from public.planning_releases release
  where release.company_id = target_company_id
  order by release.version_number desc
  limit 1;

  if target_release.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'release', jsonb_build_object(
      'id', target_release.id,
      'publication_id', target_release.id,
      'version_number', target_release.version_number,
      'comment', '',
      'created_at', target_release.published_at,
      'created_by', target_release.published_by,
      'created_by_name', target_release.published_by_name
    ),
    'snapshot', public.planning_visible_release_snapshot(target_release.snapshot)
  );
end;
$$;

create or replace function public.publish_planning_release()
returns table (
  id bigint,
  publication_id bigint,
  version_number integer,
  comment text,
  created_at timestamptz,
  created_by uuid,
  created_by_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  next_version integer;
  actor_id uuid := auth.uid();
  actor_name text;
  release_id bigint;
begin
  if target_company_id is null
    or not public.planning_user_can('publish', target_company_id, null, null, null) then
    raise exception using
      errcode = '42501',
      message = 'PLANNING_PERMISSION_DENIED: diffusion du planning.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':planning-release', 0));

  select coalesce(max(release.version_number), 0) + 1
  into next_version
  from public.planning_releases release
  where release.company_id = target_company_id;

  select coalesce(nullif(trim(profile.display_name), ''), profile.email, 'Utilisateur autorisé')
  into actor_name
  from public.profiles profile
  where profile.id = actor_id;

  insert into public.planning_releases (
    company_id,
    version_number,
    snapshot,
    published_by,
    published_by_name
  )
  values (
    target_company_id,
    next_version,
    public.planning_release_snapshot(target_company_id),
    actor_id,
    coalesce(actor_name, 'Utilisateur autorisé')
  )
  returning planning_releases.id into release_id;

  insert into public.planning_change_log (
    company_id,
    entity_kind,
    entity_id,
    action,
    payload,
    changed_by,
    changed_by_name,
    summary
  )
  values (
    target_company_id,
    'publication',
    release_id,
    'publish',
    jsonb_build_object('version_number', next_version, 'global', true),
    actor_id,
    coalesce(actor_name, 'Utilisateur autorisé'),
    'Diffusion du planning · Version ' || next_version::text
  );

  perform public.planning_queue_notification(
    target_company_id,
    'publication',
    'information',
    'Planning diffusé',
    'Version ' || next_version::text || ' · publiée le ' || current_date::text,
    'publication',
    release_id,
    null,
    null,
    current_date,
    'planning-release:' || release_id::text,
    true
  );

  return query
  select
    release.id,
    release.id,
    release.version_number,
    ''::text,
    release.published_at,
    release.published_by,
    release.published_by_name
  from public.planning_releases release
  where release.id = release_id;
end;
$$;

revoke execute on function public.planning_release_snapshot(bigint) from public, anon, authenticated;
revoke execute on function public.planning_visible_release_snapshot(jsonb) from public, anon, authenticated;
revoke execute on function public.planning_release_history() from public, anon;
revoke execute on function public.latest_planning_release() from public, anon;
revoke execute on function public.publish_planning_release() from public, anon;
grant execute on function public.planning_release_history() to authenticated;
grant execute on function public.latest_planning_release() to authenticated;
grant execute on function public.publish_planning_release() to authenticated;

alter table public.planning_absences
  drop constraint if exists planning_absences_reason_check;

alter table public.planning_absences
  add constraint planning_absences_reason_check
  check (length(trim(reason)) <= 1000);

create or replace function public.save_planning_absence(
  p_absence_id bigint,
  p_person_id bigint,
  p_absence_type text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint;
  target_id bigint;
  existing_absence public.planning_absences%rowtype;
  can_manage_company boolean;
  normalized_reason text := trim(coalesce(p_reason, ''));
begin
  select company_id into target_company_id from public.people where id = p_person_id;
  can_manage_company := target_company_id is not null
    and public.planning_user_can('request_absence', target_company_id, null, null, null);
  if target_company_id is null
    or not public.user_belongs_to_company(target_company_id)
    or (not can_manage_company and p_person_id is distinct from public.current_person_id()) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: demande d absence.';
  end if;
  if p_absence_type not in ('leave', 'illness', 'training', 'medical_visit', 'unavailability', 'recovery')
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
    or length(normalized_reason) > 1000 then
    raise exception using errcode = '22023', message = 'PLANNING_ABSENCE_INVALID: type et dates obligatoires.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':absence:' || p_person_id::text, 0));

  if p_absence_id is not null then
    select * into existing_absence from public.planning_absences where id = p_absence_id for update;
    if existing_absence.id is null or existing_absence.company_id is distinct from target_company_id
      or existing_absence.person_id is distinct from p_person_id or existing_absence.status <> 'requested'
      or (not can_manage_company and existing_absence.requested_by is distinct from auth.uid()) then
      raise exception using errcode = '42501', message = 'PLANNING_ABSENCE_NOT_EDITABLE';
    end if;
  end if;

  if exists (
    select 1
    from public.planning_absences absence
    where absence.company_id = target_company_id
      and absence.person_id = p_person_id
      and absence.status in ('requested', 'approved')
      and (p_absence_id is null or absence.id <> p_absence_id)
      and absence.starts_at < p_ends_at
      and absence.ends_at > p_starts_at
  ) then
    raise exception using errcode = '23P01', message = 'PLANNING_ABSENCE_OVERLAP';
  end if;

  if p_absence_id is null then
    insert into public.planning_absences (
      company_id,
      person_id,
      absence_type,
      starts_at,
      ends_at,
      reason
    )
    values (
      target_company_id,
      p_person_id,
      p_absence_type,
      p_starts_at,
      p_ends_at,
      normalized_reason
    )
    returning id into target_id;
  else
    update public.planning_absences
    set absence_type = p_absence_type,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        reason = normalized_reason,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_absence_id
    returning id into target_id;
  end if;

  return target_id;
end;
$$;

grant execute on function public.save_planning_absence(bigint, bigint, text, timestamptz, timestamptz, text)
  to authenticated;
revoke execute on function public.save_planning_absence(bigint, bigint, text, timestamptz, timestamptz, text)
  from public, anon;
