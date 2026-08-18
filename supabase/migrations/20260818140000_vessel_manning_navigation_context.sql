-- Navigation and operating context attached to every vessel staffing situation.

alter table public.planning_manning_matrices
  add column if not exists navigation_genre text,
  add column if not exists activity_description text;

alter table public.planning_manning_matrices
  drop constraint if exists planning_manning_matrices_navigation_genre_check,
  add constraint planning_manning_matrices_navigation_genre_check check (
    navigation_genre is null or navigation_genre in (
      'CI-CABOTAGE INTERNATIONAL',
      'CN-CABOTAGE NATIONAL',
      'NC-NAVIGATION COTIERE'
    )
  ),
  drop constraint if exists planning_manning_matrices_activity_description_check,
  add constraint planning_manning_matrices_activity_description_check check (
    activity_description is null or length(trim(activity_description)) between 2 and 2000
  );

create or replace function public.save_planning_manning_matrix(
  p_matrix_id bigint,
  p_vessel_id bigint,
  p_name text,
  p_navigation_genre text,
  p_activity_description text,
  p_effective_from date,
  p_effective_to date,
  p_status text,
  p_notes text,
  p_requirements jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint;
  target_id bigint;
  target_version integer := 1;
  requirement jsonb;
begin
  select company_id into target_company_id from public.vessels where id = p_vessel_id;
  if target_company_id is null or not public.planning_user_can('manage_manning', target_company_id, p_vessel_id, p_effective_from, p_effective_to) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: matrice.';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2
    or trim(coalesce(p_navigation_genre, '')) not in (
      'CI-CABOTAGE INTERNATIONAL',
      'CN-CABOTAGE NATIONAL',
      'NC-NAVIGATION COTIERE'
    )
    or length(trim(coalesce(p_activity_description, ''))) < 2
    or length(trim(p_activity_description)) > 2000
    or p_status not in ('draft', 'active', 'archived')
    or (p_effective_to is not null and p_effective_to < p_effective_from)
    or jsonb_typeof(coalesce(p_requirements, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_requirements, '[]'::jsonb)) = 0 then
    raise exception using errcode = '22023', message = 'PLANNING_MANNING_MATRIX_INVALID';
  end if;
  for requirement in select * from jsonb_array_elements(p_requirements) loop
    if length(trim(coalesce(requirement->>'functionLabel', ''))) = 0
      or coalesce((requirement->>'minimumCount')::integer, -1) < 0
      or coalesce((requirement->>'targetCount')::integer, -1) < coalesce((requirement->>'minimumCount')::integer, 0) then
      raise exception using errcode = '22023', message = 'PLANNING_MANNING_REQUIREMENT_INVALID';
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':manning:' || p_vessel_id::text, 0));
  if p_status = 'active' then
    update public.planning_manning_matrices set status = 'archived', updated_by = (select auth.uid()), updated_at = now()
    where company_id = target_company_id and vessel_id = p_vessel_id and status = 'active'
      and (p_matrix_id is null or id <> p_matrix_id);
  end if;

  if p_matrix_id is null then
    insert into public.planning_manning_matrices (
      company_id, vessel_id, name, navigation_genre, activity_description,
      effective_from, effective_to, status, notes
    ) values (
      target_company_id, p_vessel_id, trim(p_name), trim(p_navigation_genre), trim(p_activity_description),
      p_effective_from, p_effective_to, p_status, nullif(trim(coalesce(p_notes, '')), '')
    ) returning id into target_id;
  else
    select version + 1 into target_version from public.planning_manning_matrices
    where id = p_matrix_id and company_id = target_company_id;
    if target_version is null then raise exception using errcode = 'P0002', message = 'PLANNING_MANNING_MATRIX_NOT_FOUND'; end if;
    update public.planning_manning_matrices set
      vessel_id = p_vessel_id, name = trim(p_name), navigation_genre = trim(p_navigation_genre),
      activity_description = trim(p_activity_description), effective_from = p_effective_from,
      effective_to = p_effective_to, status = p_status, notes = nullif(trim(coalesce(p_notes, '')), ''),
      version = target_version, updated_by = (select auth.uid()), updated_at = now()
    where id = p_matrix_id returning id into target_id;
    delete from public.planning_manning_requirements where matrix_id = target_id;
  end if;

  insert into public.planning_manning_requirements (
    company_id, matrix_id, function_label, minimum_count, target_count,
    required_certificates, required_qualifications, required_authorizations,
    required_trainings, restrictions, display_order
  )
  select
    target_company_id, target_id, trim(item->>'functionLabel'), (item->>'minimumCount')::integer,
    (item->>'targetCount')::integer,
    array(select jsonb_array_elements_text(coalesce(item->'requiredCertificates', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(item->'requiredQualifications', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(item->'requiredAuthorizations', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(item->'requiredTrainings', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(item->'restrictions', '[]'::jsonb))),
    ordinal - 1
  from jsonb_array_elements(p_requirements) with ordinality as requirement_rows(item, ordinal);
  return target_id;
end;
$$;

revoke all on function public.save_planning_manning_matrix(bigint, bigint, text, text, text, date, date, text, text, jsonb) from public, anon;
grant execute on function public.save_planning_manning_matrix(bigint, bigint, text, text, text, date, date, text, text, jsonb) to authenticated;

-- Keep the previous overload during the client rollout so an already-open 3.21.0
-- session can still save a situation. New 3.21.1 calls resolve to the overload
-- above because they include p_navigation_genre and p_activity_description.

comment on column public.planning_manning_matrices.navigation_genre is 'Navigation genre selected for this staffing situation.';
comment on column public.planning_manning_matrices.activity_description is 'Predefined or custom operating activity and limits for this staffing situation.';
