-- Allow an authorized user to resume changes from every locked publication state,
-- including a period that was previously archived. Published snapshots remain immutable.

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
  target_company_id bigint := public.current_planning_company_id();
  normalized_comment text := nullif(trim(coalesce(p_comment, '')), '');
  actor_id uuid := (select auth.uid());
  actor_name text := public.planning_current_actor_name();
begin
  if target_company_id is null then
    raise exception using errcode = '42501', message = 'Aucune entreprise active ne permet de piloter ce planning.';
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
    if p_vessel_id is not null and not exists (
      select 1 from public.vessels vessel where vessel.id = p_vessel_id and vessel.company_id = target_company_id
    ) then
      raise exception using errcode = '23503', message = 'Le navire de publication est introuvable dans cette entreprise.';
    end if;
    if not public.planning_user_can('submit', target_company_id, p_vessel_id, p_starts_on, p_ends_on) then
      raise exception using errcode = '42501', message = 'Vous ne pouvez pas soumettre ce périmètre de planning.';
    end if;

    requested_scope_key := case when p_vessel_id is null then 'fleet' else 'vessel:' || p_vessel_id::text end;
    perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':' || requested_scope_key || ':' || p_starts_on || ':' || p_ends_on, 0));

    select publication.* into target
    from public.planning_publications publication
    where publication.company_id = target_company_id
      and publication.scope_key = requested_scope_key
      and publication.starts_on = p_starts_on
      and publication.ends_on = p_ends_on
    for update;

    if not found then
      insert into public.planning_publications (
        company_id, vessel_id, scope_key, starts_on, ends_on, status,
        created_by, created_by_name, updated_by, updated_by_name
      ) values (
        target_company_id, p_vessel_id, requested_scope_key, p_starts_on, p_ends_on, 'preparation',
        actor_id, actor_name, actor_id, actor_name
      ) returning * into target;
    end if;
  else
    select publication.* into target
    from public.planning_publications publication
    where publication.id = p_publication_id
      and publication.company_id = target_company_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Cette publication de planning est introuvable.';
    end if;
    if not public.planning_user_can(p_action, target.company_id, target.vessel_id, target.starts_on, target.ends_on) then
      raise exception using errcode = '42501', message = 'Vous ne pouvez pas exécuter cette action sur ce périmètre de planning.';
    end if;
  end if;

  previous_status := target.status;
  if p_action = 'submit' then
    if target.status not in ('preparation', 'modified_after_publication') then
      raise exception using errcode = '22023', message = 'Cette période ne peut pas être soumise dans son état actuel.';
    end if;
    update public.planning_publications
    set status = 'pending_validation', comment = normalized_comment,
        submitted_at = now(), submitted_by = actor_id, submitted_by_name = actor_name,
        validated_at = null, validated_by = null, validated_by_name = null,
        locked_at = now(), locked_by = actor_id, locked_by_name = actor_name,
        updated_at = now(), updated_by = actor_id, updated_by_name = actor_name
    where id = target.id returning * into target;
  elsif p_action = 'validate' then
    if target.status <> 'pending_validation' then
      raise exception using errcode = '22023', message = 'Seul un planning en attente peut être validé.';
    end if;
    update public.planning_publications
    set status = 'validated', comment = coalesce(normalized_comment, comment),
        validated_at = now(), validated_by = actor_id, validated_by_name = actor_name,
        updated_at = now(), updated_by = actor_id, updated_by_name = actor_name
    where id = target.id returning * into target;
  elsif p_action = 'publish' then
    if target.status <> 'validated' then
      raise exception using errcode = '22023', message = 'Le planning doit être validé avant publication.';
    end if;
    update public.planning_publications
    set status = 'published', current_version = current_version + 1,
        comment = coalesce(normalized_comment, comment),
        published_at = now(), published_by = actor_id, published_by_name = actor_name,
        locked_at = coalesce(locked_at, now()), locked_by = coalesce(locked_by, actor_id),
        locked_by_name = coalesce(locked_by_name, actor_name),
        updated_at = now(), updated_by = actor_id, updated_by_name = actor_name
    where id = target.id returning * into target;

    insert into public.planning_versions (
      company_id, publication_id, version_number, snapshot, comment, created_by, created_by_name
    ) values (
      target.company_id, target.id, target.current_version,
      public.planning_publication_snapshot(target.id), normalized_comment, actor_id, actor_name
    );
  elsif p_action = 'reopen' then
    if target.status not in ('pending_validation', 'validated', 'published', 'archived') then
      raise exception using errcode = '22023', message = 'Cette période est déjà modifiable.';
    end if;
    if normalized_comment is null or length(normalized_comment) < 10 then
      raise exception using errcode = '22023', message = 'La réouverture exige un motif d’au moins 10 caractères.';
    end if;
    update public.planning_publications
    set status = case when current_version > 0 then 'modified_after_publication' else 'preparation' end,
        comment = normalized_comment, locked_at = null, locked_by = null, locked_by_name = null,
        updated_at = now(), updated_by = actor_id, updated_by_name = actor_name
    where id = target.id returning * into target;
  else
    if target.status = 'archived' then
      raise exception using errcode = '22023', message = 'Cette période est déjà archivée.';
    end if;
    if normalized_comment is null or length(normalized_comment) < 10 then
      raise exception using errcode = '22023', message = 'L’archivage exige un motif d’au moins 10 caractères.';
    end if;
    update public.planning_publications
    set status = 'archived', comment = normalized_comment,
        locked_at = coalesce(locked_at, now()), locked_by = coalesce(locked_by, actor_id),
        locked_by_name = coalesce(locked_by_name, actor_name),
        updated_at = now(), updated_by = actor_id, updated_by_name = actor_name
    where id = target.id returning * into target;
  end if;

  insert into public.planning_change_log (
    company_id, entity_kind, entity_id, action, payload, changed_by, changed_by_name,
    vessel_id, starts_on, ends_on, summary
  ) values (
    target.company_id, 'publication', target.id, p_action,
    jsonb_build_object(
      'previous_status', previous_status, 'status', target.status,
      'version', target.current_version, 'starts_on', target.starts_on,
      'ends_on', target.ends_on, 'vessel_id', target.vessel_id, 'comment', normalized_comment
    ),
    actor_id, actor_name, target.vessel_id, target.starts_on, target.ends_on,
    case p_action
      when 'submit' then 'Planning soumis à validation'
      when 'validate' then 'Planning validé'
      when 'publish' then 'Planning publié en version ' || target.current_version::text
      when 'reopen' then 'Planning rouvert pour modification'
      else 'Planning archivé'
    end
  );
  return target;
end;
$$;

revoke all on function public.transition_planning_publication(text, bigint, date, date, bigint, text) from public, anon, authenticated;
grant execute on function public.transition_planning_publication(text, bigint, date, date, bigint, text) to authenticated;
