create table if not exists public.planning_publications (
  id bigint generated always as identity primary key,
  vessel_id bigint references public.vessels(id) on delete restrict,
  scope_key text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'preparation',
  current_version integer not null default 0,
  comment text,
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id) on delete set null,
  validated_at timestamptz,
  validated_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  locked_at timestamptz,
  locked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  constraint planning_publications_valid_dates check (ends_on >= starts_on),
  constraint planning_publications_status_check check (
    status in ('preparation', 'pending_validation', 'validated', 'published', 'modified_after_publication', 'archived')
  ),
  constraint planning_publications_version_check check (current_version >= 0),
  constraint planning_publications_scope_key_check check (
    scope_key = case when vessel_id is null then 'fleet' else 'vessel:' || vessel_id::text end
  ),
  constraint planning_publications_scope_period_key unique (scope_key, starts_on, ends_on)
);

create index if not exists planning_publications_vessel_id_idx
  on public.planning_publications (vessel_id);
create index if not exists planning_publications_status_dates_idx
  on public.planning_publications (status, starts_on, ends_on);
create index if not exists planning_publications_locked_dates_idx
  on public.planning_publications (starts_on, ends_on, vessel_id)
  where locked_at is not null;

revoke all on public.planning_publications from anon, authenticated;
grant select on public.planning_publications to authenticated;

alter table public.planning_publications enable row level security;

drop policy if exists planning_publications_planning_read on public.planning_publications;
create policy planning_publications_planning_read on public.planning_publications
  for select to authenticated
  using ((select public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin'])));

create table if not exists public.planning_versions (
  id bigint generated always as identity primary key,
  publication_id bigint not null references public.planning_publications(id) on delete cascade,
  version_number integer not null,
  status text not null default 'published',
  snapshot jsonb not null,
  comment text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  constraint planning_versions_number_check check (version_number > 0),
  constraint planning_versions_status_check check (status = 'published'),
  constraint planning_versions_publication_version_key unique (publication_id, version_number)
);

create index if not exists planning_versions_publication_id_idx
  on public.planning_versions (publication_id, version_number desc);

revoke all on public.planning_versions from anon, authenticated;
grant select on public.planning_versions to authenticated;

alter table public.planning_versions enable row level security;

drop policy if exists planning_versions_admin_read on public.planning_versions;
create policy planning_versions_admin_read on public.planning_versions
  for select to authenticated
  using ((select public.has_role('admin')));

alter table public.planning_change_log
  drop constraint if exists planning_change_log_entity_kind_check;
alter table public.planning_change_log
  add constraint planning_change_log_entity_kind_check
  check (entity_kind in ('assignment', 'day', 'period', 'project', 'vessel', 'publication'));

alter table public.planning_change_log
  drop constraint if exists planning_change_log_action_check;
alter table public.planning_change_log
  add constraint planning_change_log_action_check
  check (action in ('create', 'update', 'archive', 'delete', 'submit', 'validate', 'publish', 'reopen'));

create or replace function public.planning_publication_snapshot(target_publication_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'scope', jsonb_build_object(
      'vessel_id', publication.vessel_id,
      'starts_on', publication.starts_on,
      'ends_on', publication.ends_on
    ),
    'assignments', coalesce((
      select jsonb_agg(to_jsonb(assignment) order by assignment.id)
      from public.planning_assignments assignment
      where assignment.starts_on <= publication.ends_on
        and assignment.ends_on >= publication.starts_on
        and (publication.vessel_id is null or assignment.vessel_id = publication.vessel_id)
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(to_jsonb(day_record) order by day_record.id)
      from public.planning_days day_record
      where day_record.work_date between publication.starts_on and publication.ends_on
        and (publication.vessel_id is null or day_record.vessel_id = publication.vessel_id)
    ), '[]'::jsonb),
    'periods', coalesce((
      select jsonb_agg(to_jsonb(period_record) order by period_record.id)
      from public.planning_periods period_record
      where period_record.starts_on <= publication.ends_on
        and period_record.ends_on >= publication.starts_on
        and (publication.vessel_id is null or period_record.vessel_id = publication.vessel_id)
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(to_jsonb(project) order by project.id)
      from public.planning_projects project
      where project.starts_on is not null
        and project.starts_on <= publication.ends_on
        and coalesce(project.ends_on, project.starts_on) >= publication.starts_on
        and (
          publication.vessel_id is null
          or project.primary_vessel_id = publication.vessel_id
          or project.secondary_vessel_id = publication.vessel_id
        )
    ), '[]'::jsonb)
  )
  from public.planning_publications publication
  where publication.id = target_publication_id;
$$;

revoke all on function public.planning_publication_snapshot(bigint) from public, anon, authenticated;

create or replace function public.transition_planning_publication(
  p_action text,
  p_publication_id bigint default null,
  p_starts_on date default null,
  p_ends_on date default null,
  p_vessel_id bigint default null,
  p_comment text default null
)
returns public.planning_publications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.planning_publications%rowtype;
  previous_status text;
  requested_scope_key text;
  normalized_comment text := nullif(trim(coalesce(p_comment, '')), '');
begin
  if not public.has_role('admin') then
    raise exception using
      errcode = '42501',
      message = 'Seul un administrateur peut piloter la publication du planning.';
  end if;

  if p_action not in ('submit', 'validate', 'publish', 'reopen', 'archive') then
    raise exception using errcode = '22023', message = 'Action de publication inconnue.';
  end if;

  if p_publication_id is null then
    if p_action <> 'submit' then
      raise exception using errcode = '22023', message = 'La période doit être soumise avant cette action.';
    end if;
    if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
      raise exception using errcode = '22023', message = 'La période de publication est invalide.';
    end if;

    requested_scope_key := case when p_vessel_id is null then 'fleet' else 'vessel:' || p_vessel_id::text end;
    perform pg_advisory_xact_lock(hashtextextended(requested_scope_key || ':' || p_starts_on || ':' || p_ends_on, 0));

    select publication.*
    into target
    from public.planning_publications publication
    where publication.scope_key = requested_scope_key
      and publication.starts_on = p_starts_on
      and publication.ends_on = p_ends_on
    for update;

    if not found then
      insert into public.planning_publications (
        vessel_id,
        scope_key,
        starts_on,
        ends_on,
        status,
        created_by,
        updated_by
      )
      values (
        p_vessel_id,
        requested_scope_key,
        p_starts_on,
        p_ends_on,
        'preparation',
        (select auth.uid()),
        (select auth.uid())
      )
      returning * into target;
    end if;
  else
    select publication.*
    into target
    from public.planning_publications publication
    where publication.id = p_publication_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Cette publication de planning est introuvable.';
    end if;
  end if;

  previous_status := target.status;

  if p_action = 'submit' then
    if target.status not in ('preparation', 'modified_after_publication') then
      raise exception using errcode = '22023', message = 'Cette période ne peut pas être soumise dans son état actuel.';
    end if;

    update public.planning_publications
    set status = 'pending_validation',
        comment = normalized_comment,
        submitted_at = now(),
        submitted_by = (select auth.uid()),
        validated_at = null,
        validated_by = null,
        locked_at = now(),
        locked_by = (select auth.uid()),
        updated_at = now(),
        updated_by = (select auth.uid())
    where id = target.id
    returning * into target;
  elsif p_action = 'validate' then
    if target.status <> 'pending_validation' then
      raise exception using errcode = '22023', message = 'Seul un planning en attente peut être validé.';
    end if;

    update public.planning_publications
    set status = 'validated',
        comment = coalesce(normalized_comment, comment),
        validated_at = now(),
        validated_by = (select auth.uid()),
        updated_at = now(),
        updated_by = (select auth.uid())
    where id = target.id
    returning * into target;
  elsif p_action = 'publish' then
    if target.status <> 'validated' then
      raise exception using errcode = '22023', message = 'Le planning doit être validé avant publication.';
    end if;

    update public.planning_publications
    set status = 'published',
        current_version = current_version + 1,
        comment = coalesce(normalized_comment, comment),
        published_at = now(),
        published_by = (select auth.uid()),
        locked_at = coalesce(locked_at, now()),
        locked_by = coalesce(locked_by, (select auth.uid())),
        updated_at = now(),
        updated_by = (select auth.uid())
    where id = target.id
    returning * into target;

    insert into public.planning_versions (
      publication_id,
      version_number,
      snapshot,
      comment,
      created_by
    )
    values (
      target.id,
      target.current_version,
      public.planning_publication_snapshot(target.id),
      normalized_comment,
      (select auth.uid())
    );
  elsif p_action = 'reopen' then
    if target.status not in ('pending_validation', 'validated', 'published') then
      raise exception using errcode = '22023', message = 'Cette période est déjà modifiable.';
    end if;
    if normalized_comment is null or length(normalized_comment) < 10 then
      raise exception using errcode = '22023', message = 'La réouverture exige un motif d’au moins 10 caractères.';
    end if;

    update public.planning_publications
    set status = case when current_version > 0 then 'modified_after_publication' else 'preparation' end,
        comment = normalized_comment,
        locked_at = null,
        locked_by = null,
        updated_at = now(),
        updated_by = (select auth.uid())
    where id = target.id
    returning * into target;
  else
    if normalized_comment is null or length(normalized_comment) < 10 then
      raise exception using errcode = '22023', message = 'L’archivage exige un motif d’au moins 10 caractères.';
    end if;

    update public.planning_publications
    set status = 'archived',
        comment = normalized_comment,
        locked_at = coalesce(locked_at, now()),
        locked_by = coalesce(locked_by, (select auth.uid())),
        updated_at = now(),
        updated_by = (select auth.uid())
    where id = target.id
    returning * into target;
  end if;

  insert into public.planning_change_log (entity_kind, entity_id, action, payload, changed_by)
  values (
    'publication',
    target.id,
    p_action,
    jsonb_build_object(
      'previous_status', previous_status,
      'status', target.status,
      'version', target.current_version,
      'starts_on', target.starts_on,
      'ends_on', target.ends_on,
      'vessel_id', target.vessel_id,
      'comment', normalized_comment
    ),
    (select auth.uid())
  );

  return target;
end;
$$;

revoke all on function public.transition_planning_publication(text, bigint, date, date, bigint, text)
  from public, anon, authenticated;
grant execute on function public.transition_planning_publication(text, bigint, date, date, bigint, text)
  to authenticated;

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
  select exists (
    select 1
    from public.planning_publications publication
    where publication.locked_at is not null
      and publication.starts_on <= target_ends_on
      and publication.ends_on >= target_starts_on
      and (publication.vessel_id is null or publication.vessel_id = target_vessel_id)
  );
$$;

revoke all on function public.planning_scope_is_locked(date, date, bigint) from public, anon, authenticated;

create or replace function public.assert_planning_mutation_unlocked()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_starts_on date;
  old_ends_on date;
  old_vessel_id bigint;
  old_secondary_vessel_id bigint;
  new_starts_on date;
  new_ends_on date;
  new_vessel_id bigint;
  new_secondary_vessel_id bigint;
begin
  if tg_op <> 'INSERT' then
    if tg_table_name = 'planning_days' then
      old_starts_on := old.work_date;
      old_ends_on := old.work_date;
      old_vessel_id := old.vessel_id;
    elsif tg_table_name = 'planning_periods' then
      old_starts_on := old.starts_on;
      old_ends_on := old.ends_on;
      old_vessel_id := old.vessel_id;
    elsif tg_table_name = 'planning_projects' then
      old_starts_on := old.starts_on;
      old_ends_on := coalesce(old.ends_on, old.starts_on);
      old_vessel_id := old.primary_vessel_id;
      old_secondary_vessel_id := old.secondary_vessel_id;
    else
      old_starts_on := old.starts_on;
      old_ends_on := old.ends_on;
      old_vessel_id := old.vessel_id;
    end if;
  end if;

  if tg_op <> 'DELETE' then
    if tg_table_name = 'planning_days' then
      new_starts_on := new.work_date;
      new_ends_on := new.work_date;
      new_vessel_id := new.vessel_id;
    elsif tg_table_name = 'planning_periods' then
      new_starts_on := new.starts_on;
      new_ends_on := new.ends_on;
      new_vessel_id := new.vessel_id;
    elsif tg_table_name = 'planning_projects' then
      new_starts_on := new.starts_on;
      new_ends_on := coalesce(new.ends_on, new.starts_on);
      new_vessel_id := new.primary_vessel_id;
      new_secondary_vessel_id := new.secondary_vessel_id;
    else
      new_starts_on := new.starts_on;
      new_ends_on := new.ends_on;
      new_vessel_id := new.vessel_id;
    end if;
  end if;

  if (
    old_starts_on is not null
    and (
      public.planning_scope_is_locked(old_starts_on, old_ends_on, old_vessel_id)
      or (
        old_secondary_vessel_id is not null
        and public.planning_scope_is_locked(old_starts_on, old_ends_on, old_secondary_vessel_id)
      )
    )
  ) or (
    new_starts_on is not null
    and (
      public.planning_scope_is_locked(new_starts_on, new_ends_on, new_vessel_id)
      or (
        new_secondary_vessel_id is not null
        and public.planning_scope_is_locked(new_starts_on, new_ends_on, new_secondary_vessel_id)
      )
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PLANNING_LOCKED: cette période est soumise, validée ou publiée.',
      hint = 'Réouvrez la période avec un motif avant de modifier ses événements.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.assert_planning_mutation_unlocked() from public, anon, authenticated;

drop trigger if exists planning_assignments_lock_guard on public.planning_assignments;
create trigger planning_assignments_lock_guard
  before insert or update or delete on public.planning_assignments
  for each row execute function public.assert_planning_mutation_unlocked();

drop trigger if exists planning_days_lock_guard on public.planning_days;
create trigger planning_days_lock_guard
  before insert or update or delete on public.planning_days
  for each row execute function public.assert_planning_mutation_unlocked();

drop trigger if exists planning_periods_lock_guard on public.planning_periods;
create trigger planning_periods_lock_guard
  before insert or update or delete on public.planning_periods
  for each row execute function public.assert_planning_mutation_unlocked();

drop trigger if exists planning_projects_lock_guard on public.planning_projects;
create trigger planning_projects_lock_guard
  before insert or update or delete on public.planning_projects
  for each row execute function public.assert_planning_mutation_unlocked();

create or replace function public.audit_planning_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_kind text;
  target_id bigint;
  target_action text;
begin
  target_kind := case tg_table_name
    when 'planning_assignments' then 'assignment'
    when 'planning_days' then 'day'
    when 'planning_periods' then 'period'
    when 'planning_projects' then 'project'
  end;
  target_id := case when tg_op = 'DELETE' then old.id else new.id end;
  target_action := case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;

  insert into public.planning_change_log (entity_kind, entity_id, action, payload, changed_by)
  values (
    target_kind,
    target_id,
    target_action,
    jsonb_build_object(
      'before', case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      'after', case when tg_op = 'DELETE' then null else to_jsonb(new) end
    ),
    (select auth.uid())
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_planning_mutation() from public, anon, authenticated;

drop trigger if exists planning_assignments_audit on public.planning_assignments;
create trigger planning_assignments_audit
  after insert or update or delete on public.planning_assignments
  for each row execute function public.audit_planning_mutation();

drop trigger if exists planning_days_audit on public.planning_days;
create trigger planning_days_audit
  after insert or update or delete on public.planning_days
  for each row execute function public.audit_planning_mutation();

drop trigger if exists planning_periods_audit on public.planning_periods;
create trigger planning_periods_audit
  after insert or update or delete on public.planning_periods
  for each row execute function public.audit_planning_mutation();

drop trigger if exists planning_projects_audit on public.planning_projects;
create trigger planning_projects_audit
  after insert or update or delete on public.planning_projects
  for each row execute function public.audit_planning_mutation();

comment on table public.planning_publications is
  'Workflow de validation et publication par période, global flotte ou limité à un navire.';
comment on table public.planning_versions is
  'Instantanés immuables des événements Planning créés à chaque publication.';
comment on function public.transition_planning_publication(text, bigint, date, date, bigint, text) is
  'Transition transactionnelle du workflow Planning. Réservée aux administrateurs et auditée.';
