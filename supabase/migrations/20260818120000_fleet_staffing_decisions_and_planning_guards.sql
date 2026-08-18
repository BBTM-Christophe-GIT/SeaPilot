-- BBTM - Flotte and daily staffing decision controls.
-- public.vessels remains the canonical list imported from SharePoint list
-- 543b9f00-aed2-489a-808a-7b64cc835a83.

insert into public.role_module_permissions (role_key, module_key, is_visible)
select role.key, 'fleet', true
from public.roles role
where role.key in ('admin', 'direction', 'armement', 'capitaine', 'marin')
on conflict (role_key, module_key) do nothing;

create table if not exists public.planning_staffing_derogations (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  vessel_id bigint not null references public.vessels(id) on delete restrict,
  requirement_id bigint not null references public.planning_manning_requirements(id) on delete restrict,
  watch_group text not null,
  starts_on date not null,
  ends_on date not null,
  credential_label text not null,
  reason text not null,
  status text not null default 'active',
  granted_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_staffing_derogations_dates_check check (ends_on >= starts_on),
  constraint planning_staffing_derogations_watch_check check (length(trim(watch_group)) > 0),
  constraint planning_staffing_derogations_credential_check check (length(trim(credential_label)) > 0),
  constraint planning_staffing_derogations_reason_check check (length(trim(reason)) >= 10),
  constraint planning_staffing_derogations_status_check check (status in ('active', 'revoked'))
);

create index if not exists planning_staffing_derogations_scope_idx
  on public.planning_staffing_derogations (company_id, vessel_id, watch_group, starts_on, ends_on)
  where status = 'active';
create index if not exists planning_staffing_derogations_requirement_idx
  on public.planning_staffing_derogations (requirement_id);

alter table public.planning_staffing_derogations enable row level security;
revoke all on table public.planning_staffing_derogations from public, anon, authenticated;
grant select on table public.planning_staffing_derogations to authenticated;

drop policy if exists planning_staffing_derogations_admin_read on public.planning_staffing_derogations;
create policy planning_staffing_derogations_admin_read on public.planning_staffing_derogations
  for select to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_company_role(company_id, array['admin']))
  );

drop policy if exists planning_staffing_derogations_admin_write on public.planning_staffing_derogations;
create policy planning_staffing_derogations_admin_write on public.planning_staffing_derogations
  for all to authenticated
  using ((select public.has_company_role(company_id, array['admin'])))
  with check ((select public.has_company_role(company_id, array['admin'])));

create or replace function public.planning_staffing_board_status(
  p_vessel_id bigint,
  p_watch_group text,
  p_work_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  normalized_watch text := lower(trim(coalesce(p_watch_group, '')));
  target_matrix public.planning_manning_matrices%rowtype;
  requirement public.planning_manning_requirements%rowtype;
  assigned_count integer;
  eligible_captain_count integer;
  hr_captain_count integer;
  provisional_count integer;
  missing_credential record;
  derogation_exists boolean;
  composition jsonb := '[]'::jsonb;
  discrepancies jsonb := '[]'::jsonb;
  blocking_count integer := 0;
  warning_count integer := 0;
begin
  if target_company_id is null or p_vessel_id is null or p_work_date is null or normalized_watch = ''
    or not public.user_belongs_to_company(target_company_id) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: contrôle de la décision d’effectif.';
  end if;

  if not exists (
    select 1 from public.vessels vessel
    where vessel.id = p_vessel_id and vessel.company_id = target_company_id
  ) then
    raise exception using errcode = '23503', message = 'PLANNING_STAFFING_VESSEL_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'assignment_id', assignment.id,
    'person_id', person.id,
    'person_name', trim(concat_ws(' ', person.first_name, person.last_name)),
    'hr_function_label', coalesce(person.function_label, ''),
    'planning_function_label', assignment.assignment_role,
    'confirmation_status', assignment.confirmation_status,
    'starts_on', assignment.starts_on,
    'ends_on', assignment.ends_on
  ) order by lower(assignment.assignment_role), person.last_name, person.first_name), '[]'::jsonb)
  into composition
  from public.planning_assignments assignment
  join public.people person on person.id = assignment.crew_person_id and person.company_id = assignment.company_id
  where assignment.company_id = target_company_id
    and assignment.vessel_id = p_vessel_id
    and lower(trim(coalesce(assignment.watch_group, ''))) = normalized_watch
    and p_work_date between assignment.starts_on and assignment.ends_on
    and coalesce(assignment.confirmation_status, '') <> 'cancelled';

  select * into target_matrix
  from public.planning_manning_matrices matrix
  where matrix.company_id = target_company_id
    and matrix.vessel_id = p_vessel_id
    and matrix.status = 'active'
    and matrix.effective_from <= p_work_date
    and (matrix.effective_to is null or matrix.effective_to >= p_work_date)
  order by matrix.effective_from desc, matrix.id desc
  limit 1;

  if target_matrix.id is null then
    discrepancies := discrepancies || jsonb_build_array(jsonb_build_object(
      'type', 'decision_missing', 'severity', 'blocking',
      'message', 'Aucune situation active de Décision d’effectif ne couvre cette journée.'
    ));
    blocking_count := blocking_count + 1;
  end if;

  select
    count(*) filter (where person.function_label = 'Capitaine'),
    count(*) filter (where person.function_label = 'Capitaine' and assignment.assignment_role = 'Capitaine'),
    count(*) filter (where assignment.confirmation_status <> 'confirmed')
  into hr_captain_count, eligible_captain_count, provisional_count
  from public.planning_assignments assignment
  join public.people person on person.id = assignment.crew_person_id and person.company_id = assignment.company_id
  where assignment.company_id = target_company_id
    and assignment.vessel_id = p_vessel_id
    and lower(trim(coalesce(assignment.watch_group, ''))) = normalized_watch
    and p_work_date between assignment.starts_on and assignment.ends_on
    and coalesce(assignment.confirmation_status, '') <> 'cancelled';

  if provisional_count > 0 then
    discrepancies := discrepancies || jsonb_build_array(jsonb_build_object(
      'type', 'functions_unconfirmed', 'severity', 'blocking',
      'message', 'Les fonctions Planning de la bordée doivent être confirmées par un Administrateur.'
    ));
    blocking_count := blocking_count + 1;
  end if;

  if hr_captain_count > 1 and provisional_count > 0 then
    discrepancies := discrepancies || jsonb_build_array(jsonb_build_object(
      'type', 'multiple_hr_captains', 'severity', 'blocking',
      'message', 'Plusieurs membres ont exactement la fonction RH « Capitaine » : réassignez leurs fonctions Planning.'
    ));
    blocking_count := blocking_count + 1;
  end if;

  if target_matrix.id is not null and (
    exists (
      select 1 from public.planning_manning_requirements matrix_requirement
      where matrix_requirement.matrix_id = target_matrix.id and matrix_requirement.function_label = 'Capitaine'
    ) or hr_captain_count > 0
  ) and eligible_captain_count <> 1 then
    discrepancies := discrepancies || jsonb_build_array(jsonb_build_object(
      'type', case when eligible_captain_count = 0 then 'captain_missing' else 'captain_multiple' end,
      'severity', 'blocking',
      'message', case when eligible_captain_count = 0
        then 'Aucun titulaire dont la fonction RH est exactement « Capitaine » n’est affecté à la fonction Planning « Capitaine ».'
        else 'Plusieurs capitaines éligibles sont affectés à la fonction Planning « Capitaine ».' end
    ));
    blocking_count := blocking_count + 1;
  end if;

  if target_matrix.id is not null then
    for requirement in
      select * from public.planning_manning_requirements matrix_requirement
      where matrix_requirement.matrix_id = target_matrix.id
      order by matrix_requirement.display_order, matrix_requirement.id
    loop
      select count(*) into assigned_count
      from public.planning_assignments assignment
      where assignment.company_id = target_company_id
        and assignment.vessel_id = p_vessel_id
        and lower(trim(coalesce(assignment.watch_group, ''))) = normalized_watch
        and p_work_date between assignment.starts_on and assignment.ends_on
        and coalesce(assignment.confirmation_status, '') <> 'cancelled'
        and lower(trim(assignment.assignment_role)) = lower(trim(requirement.function_label));

      if assigned_count < requirement.minimum_count then
        discrepancies := discrepancies || jsonb_build_array(jsonb_build_object(
          'type', 'minimum_staffing', 'severity', 'blocking',
          'requirement_id', requirement.id, 'function_label', requirement.function_label,
          'assigned_count', assigned_count, 'minimum_count', requirement.minimum_count,
          'target_count', requirement.target_count,
          'message', format('%s : %s affecté(s), minimum %s.', requirement.function_label, assigned_count, requirement.minimum_count)
        ));
        blocking_count := blocking_count + 1;
      elsif assigned_count < requirement.target_count then
        discrepancies := discrepancies || jsonb_build_array(jsonb_build_object(
          'type', 'target_staffing', 'severity', 'warning',
          'requirement_id', requirement.id, 'function_label', requirement.function_label,
          'assigned_count', assigned_count, 'minimum_count', requirement.minimum_count,
          'target_count', requirement.target_count,
          'message', format('%s : minimum atteint, cible de %s non atteinte.', requirement.function_label, requirement.target_count)
        ));
        warning_count := warning_count + 1;
      end if;

      for missing_credential in
        with required_terms as (
          select distinct trim(term) as term
          from unnest(
            requirement.required_certificates
            || requirement.required_qualifications
            || requirement.required_authorizations
            || requirement.required_trainings
          ) term
          where trim(term) <> ''
        ), assigned_people as (
          select
            person.id as person_id,
            trim(concat_ws(' ', person.first_name, person.last_name)) as person_name,
            lower(concat_ws(' ',
              person.deck_certificate_label,
              person.engine_certificate_label,
              person.grade_label,
              person.role_label,
              coalesce((
                select string_agg(document.title, ' ')
                from public.hr_documents document
                where document.company_id = person.company_id
                  and document.person_id = person.id
              ), '')
            )) as credentials
          from public.planning_assignments assignment
          join public.people person on person.id = assignment.crew_person_id and person.company_id = assignment.company_id
          where assignment.company_id = target_company_id
            and assignment.vessel_id = p_vessel_id
            and lower(trim(coalesce(assignment.watch_group, ''))) = normalized_watch
            and p_work_date between assignment.starts_on and assignment.ends_on
            and coalesce(assignment.confirmation_status, '') <> 'cancelled'
            and lower(trim(assignment.assignment_role)) = lower(trim(requirement.function_label))
        )
        select assigned_people.person_id, assigned_people.person_name, required_terms.term
        from assigned_people cross join required_terms
        where assigned_people.credentials not like '%' || lower(required_terms.term) || '%'
      loop
        select exists (
          select 1 from public.planning_staffing_derogations derogation
          where derogation.company_id = target_company_id
            and derogation.vessel_id = p_vessel_id
            and derogation.requirement_id = requirement.id
            and lower(trim(derogation.watch_group)) = normalized_watch
            and p_work_date between derogation.starts_on and derogation.ends_on
            and lower(trim(derogation.credential_label)) = lower(trim(missing_credential.term))
            and derogation.status = 'active'
        ) into derogation_exists;
        discrepancies := discrepancies || jsonb_build_array(jsonb_build_object(
          'type', 'credential_missing',
          'severity', case when derogation_exists then 'derogated' else 'blocking' end,
          'requirement_id', requirement.id,
          'function_label', requirement.function_label,
          'person_id', missing_credential.person_id,
          'person_name', missing_credential.person_name,
          'credential_label', missing_credential.term,
          'derogation', derogation_exists,
          'message', format('%s : brevet ou habilitation « %s » manquant pour %s.', requirement.function_label, missing_credential.term, missing_credential.person_name)
        ));
        if not derogation_exists then blocking_count := blocking_count + 1; end if;
      end loop;
    end loop;
  end if;

  return jsonb_build_object(
    'vessel_id', p_vessel_id,
    'watch_group', trim(p_watch_group),
    'work_date', p_work_date,
    'matrix_id', target_matrix.id,
    'matrix_name', target_matrix.name,
    'composition', composition,
    'discrepancies', discrepancies,
    'blocking_count', blocking_count,
    'warning_count', warning_count,
    'publishable', blocking_count = 0
  );
end;
$$;

create or replace function public.planning_staffing_alerts(p_starts_on date, p_ends_on date)
returns table (
  vessel_id bigint,
  watch_group text,
  work_date date,
  status jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
begin
  if target_company_id is null or p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on
    or not public.has_company_role(target_company_id, array['admin', 'direction', 'armement']) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: alertes de décision d’effectif.';
  end if;
  return query
  select scope.vessel_id, scope.watch_group, scope.work_date, board.status
  from (
    select distinct assignment.vessel_id, coalesce(nullif(trim(assignment.watch_group), ''), 'Affectation') as watch_group, day::date as work_date
    from public.planning_assignments assignment
    cross join lateral generate_series(
      greatest(assignment.starts_on, p_starts_on)::timestamp,
      least(assignment.ends_on, p_ends_on)::timestamp,
      interval '1 day'
    ) day
    where assignment.company_id = target_company_id
      and assignment.starts_on <= p_ends_on
      and assignment.ends_on >= p_starts_on
      and coalesce(assignment.confirmation_status, '') <> 'cancelled'
  ) scope
  cross join lateral (select public.planning_staffing_board_status(scope.vessel_id, scope.watch_group, scope.work_date) as status) board
  where coalesce((board.status->>'blocking_count')::integer, 0) > 0
     or coalesce((board.status->>'warning_count')::integer, 0) > 0
  order by scope.work_date, scope.vessel_id, scope.watch_group;
end;
$$;

create or replace function public.confirm_planning_board_functions(
  p_vessel_id bigint,
  p_watch_group text,
  p_work_date date,
  p_positions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  normalized_watch text := lower(trim(coalesce(p_watch_group, '')));
  position jsonb;
  target_assignment public.planning_assignments%rowtype;
  selected_ids bigint[] := '{}'::bigint[];
  selected_captain_person_id bigint;
  board_count integer;
begin
  if target_company_id is null or not public.has_company_role(target_company_id, array['admin'])
    or p_vessel_id is null or p_work_date is null or normalized_watch = ''
    or jsonb_typeof(p_positions) <> 'array' or jsonb_array_length(p_positions) = 0 then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: confirmation des fonctions de bordée.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':staffing:' || p_vessel_id::text || ':' || normalized_watch || ':' || p_work_date::text, 0));

  for position in select value from jsonb_array_elements(p_positions)
  loop
    select * into target_assignment
    from public.planning_assignments assignment
    where assignment.id = nullif(position->>'assignmentId', '')::bigint
      and assignment.company_id = target_company_id
      and assignment.vessel_id = p_vessel_id
      and lower(trim(coalesce(assignment.watch_group, ''))) = normalized_watch
      and p_work_date between assignment.starts_on and assignment.ends_on
      and coalesce(assignment.confirmation_status, '') <> 'cancelled'
    for update;
    if target_assignment.id is null or length(trim(coalesce(position->>'functionLabel', ''))) = 0 then
      raise exception using errcode = '22023', message = 'PLANNING_STAFFING_POSITION_INVALID';
    end if;
    selected_ids := array_append(selected_ids, target_assignment.id);
    update public.planning_assignments
    set assignment_role = trim(position->>'functionLabel'), confirmation_status = 'confirmed', updated_at = now()
    where id = target_assignment.id;
  end loop;

  select count(*) into board_count
  from public.planning_assignments assignment
  where assignment.company_id = target_company_id
    and assignment.vessel_id = p_vessel_id
    and lower(trim(coalesce(assignment.watch_group, ''))) = normalized_watch
    and p_work_date between assignment.starts_on and assignment.ends_on
    and coalesce(assignment.confirmation_status, '') <> 'cancelled';
  if board_count <> cardinality(selected_ids) then
    raise exception using errcode = '23514', message = 'PLANNING_STAFFING_ALL_POSITIONS_REQUIRED';
  end if;

  select assignment.crew_person_id into selected_captain_person_id
  from public.planning_assignments assignment
  join public.people person on person.id = assignment.crew_person_id and person.company_id = assignment.company_id
  where assignment.id = any(selected_ids)
    and assignment.assignment_role = 'Capitaine'
    and person.function_label = 'Capitaine'
  order by assignment.id
  limit 1;
  if selected_captain_person_id is null or (
    select count(*)
    from public.planning_assignments assignment
    join public.people person on person.id = assignment.crew_person_id and person.company_id = assignment.company_id
    where assignment.id = any(selected_ids)
      and assignment.assignment_role = 'Capitaine'
      and person.function_label = 'Capitaine'
  ) <> 1 then
    raise exception using errcode = '23514', message = 'PLANNING_STAFFING_EXACT_CAPTAIN_REQUIRED';
  end if;

  update public.planning_assignments
  set captain_person_id = selected_captain_person_id, updated_at = now()
  where id = any(selected_ids);

  return public.planning_staffing_board_status(p_vessel_id, p_watch_group, p_work_date);
end;
$$;

create or replace function public.grant_planning_staffing_derogation(
  p_vessel_id bigint,
  p_watch_group text,
  p_starts_on date,
  p_ends_on date,
  p_requirement_id bigint,
  p_credential_label text,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  saved_id bigint;
begin
  if target_company_id is null or not public.has_company_role(target_company_id, array['admin'])
    or p_vessel_id is null or p_requirement_id is null or p_starts_on is null or p_ends_on < p_starts_on
    or length(trim(coalesce(p_watch_group, ''))) = 0
    or length(trim(coalesce(p_credential_label, ''))) = 0
    or length(trim(coalesce(p_reason, ''))) < 10
    or not exists (
      select 1 from public.planning_manning_requirements requirement
      join public.planning_manning_matrices matrix on matrix.id = requirement.matrix_id
      where requirement.id = p_requirement_id
        and requirement.company_id = target_company_id
        and matrix.vessel_id = p_vessel_id
    ) then
    raise exception using errcode = '22023', message = 'PLANNING_STAFFING_DEROGATION_INVALID';
  end if;
  insert into public.planning_staffing_derogations (
    company_id, vessel_id, requirement_id, watch_group, starts_on, ends_on,
    credential_label, reason, granted_by
  ) values (
    target_company_id, p_vessel_id, p_requirement_id, trim(p_watch_group), p_starts_on, p_ends_on,
    trim(p_credential_label), trim(p_reason), auth.uid()
  ) returning id into saved_id;
  return saved_id;
end;
$$;

create or replace function public.planning_staffing_release_has_blockers(target_company_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  scope record;
  board_status jsonb;
begin
  if target_company_id is null or target_company_id is distinct from public.current_planning_company_id() then
    return true;
  end if;
  for scope in
    select distinct assignment.vessel_id, coalesce(nullif(trim(assignment.watch_group), ''), 'Affectation') as watch_group, day::date as work_date
    from public.planning_assignments assignment
    cross join lateral generate_series(
      greatest(assignment.starts_on, current_date)::timestamp,
      assignment.ends_on::timestamp,
      interval '1 day'
    ) day
    where assignment.company_id = target_company_id
      and assignment.ends_on >= current_date
      and coalesce(assignment.confirmation_status, '') <> 'cancelled'
  loop
    board_status := public.planning_staffing_board_status(scope.vessel_id, scope.watch_group, scope.work_date);
    if coalesce((board_status->>'blocking_count')::integer, 0) > 0 then return true; end if;
  end loop;
  return false;
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
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: diffusion du planning.';
  end if;
  if public.planning_staffing_release_has_blockers(target_company_id) then
    raise exception using errcode = '23514', message = 'PLANNING_STAFFING_REVIEW_REQUIRED: confirmez les fonctions, corrigez les écarts ou accordez les dérogations de brevet avant diffusion.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':planning-release', 0));
  select coalesce(max(release.version_number), 0) + 1 into next_version
  from public.planning_releases release where release.company_id = target_company_id;
  select coalesce(nullif(trim(profile.display_name), ''), profile.email, 'Utilisateur autorisé') into actor_name
  from public.profiles profile where profile.id = actor_id;
  insert into public.planning_releases (company_id, version_number, snapshot, published_by, published_by_name)
  values (target_company_id, next_version, public.planning_release_snapshot(target_company_id), actor_id, coalesce(actor_name, 'Utilisateur autorisé'))
  returning planning_releases.id into release_id;
  insert into public.planning_change_log (
    company_id, entity_kind, entity_id, action, payload, changed_by, changed_by_name, summary
  ) values (
    target_company_id, 'publication', release_id, 'publish',
    jsonb_build_object('version_number', next_version, 'global', true), actor_id,
    coalesce(actor_name, 'Utilisateur autorisé'), 'Diffusion du planning · Version ' || next_version::text
  );
  perform public.planning_queue_notification(
    target_company_id, 'publication', 'information', 'Planning diffusé',
    'Version ' || next_version::text || ' · publiée le ' || current_date::text,
    'publication', release_id, null, null, current_date, 'planning-release:' || release_id::text, true
  );
  return query
  select release.id, release.id, release.version_number, ''::text, release.published_at, release.published_by, release.published_by_name
  from public.planning_releases release where release.id = release_id;
end;
$$;

revoke all on function public.planning_staffing_board_status(bigint, text, date) from public, anon, authenticated;
revoke all on function public.planning_staffing_alerts(date, date) from public, anon, authenticated;
revoke all on function public.confirm_planning_board_functions(bigint, text, date, jsonb) from public, anon, authenticated;
revoke all on function public.grant_planning_staffing_derogation(bigint, text, date, date, bigint, text, text) from public, anon, authenticated;
revoke all on function public.planning_staffing_release_has_blockers(bigint) from public, anon, authenticated;
grant execute on function public.planning_staffing_board_status(bigint, text, date) to authenticated;
grant execute on function public.planning_staffing_alerts(date, date) to authenticated;
grant execute on function public.confirm_planning_board_functions(bigint, text, date, jsonb) to authenticated;
grant execute on function public.grant_planning_staffing_derogation(bigint, text, date, date, bigint, text, text) to authenticated;

comment on table public.planning_staffing_derogations is
  'Administrator-authorized, period-scoped credential exceptions. The underlying staffing gap remains visible and audited.';
comment on function public.confirm_planning_board_functions(bigint, text, date, jsonb) is
  'Confirms every joined Planning assignment of a vessel/watch board and records exactly one eligible HR Capitaine as captain.';
