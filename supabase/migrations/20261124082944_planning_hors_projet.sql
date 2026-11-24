alter table public.planning_projects
  add constraint planning_projects_hors_projet_identity_check check (
    source_label <> 'seapilot-hors-projet'
    or (
      catalog_project_id is null
      and event_type = 'operation'
      and char_length(title) <= 305
      and title ~ '^HP - [^[:space:]](.*[^[:space:]])?$'
    )
  );

-- Generic Planning writers may set their own source label during an edit.
-- Keep the source marker so the HP invariant and presentation still apply.
create function public.preserve_planning_hors_projet_source()
returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.source_label := old.source_label;
  return new;
end;
$$;

revoke all on function public.preserve_planning_hors_projet_source() from public, anon, authenticated;

create trigger planning_projects_preserve_hors_projet_source
before update of source_label on public.planning_projects
for each row when (old.source_label = 'seapilot-hors-projet')
execute function public.preserve_planning_hors_projet_source();

create function public.planning_create_out_of_project(
  target_title text,
  target_primary_vessel_id bigint,
  target_starts_on date
)
returns table (
  id bigint,
  catalog_project_id bigint,
  title text,
  starts_on date,
  ends_on date,
  primary_vessel_id bigint,
  primary_vessel_name text,
  status text,
  event_type text,
  source_label text
)
language plpgsql security invoker set search_path = '' as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  operation_name text := regexp_replace(target_title, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  selected_vessel_name text;
begin
  if (select auth.uid()) is null or not coalesce(public.planning_user_can(
    'edit_event', target_company_id, target_primary_vessel_id, target_starts_on, target_starts_on
  ), false) then
    raise exception 'Vous ne pouvez pas créer une opération sur ce planning.' using errcode = '42501';
  end if;
  if nullif(operation_name, '') is null or char_length(operation_name) > 300 then
    raise exception 'Le nom du projet doit contenir entre 1 et 300 caractères.' using errcode = '22023';
  end if;
  if target_primary_vessel_id is null or target_starts_on is null then
    raise exception 'Le navire et la date du planning sont obligatoires.' using errcode = '22023';
  end if;

  select vessel.name into selected_vessel_name
  from public.vessels vessel
  where vessel.id = target_primary_vessel_id
    and vessel.company_id = target_company_id
    and vessel.active;

  if not found then
    raise exception 'Sélectionnez un navire actif de la société.' using errcode = '22023';
  end if;

  return query
  insert into public.planning_projects as occurrence (
    company_id, title, starts_on, ends_on, primary_vessel_id, primary_vessel_name,
    status, event_type, source_label
  ) values (
    target_company_id, 'HP - ' || operation_name, target_starts_on, target_starts_on,
    target_primary_vessel_id, selected_vessel_name, 'Brouillon', 'operation', 'seapilot-hors-projet'
  )
  returning occurrence.id, occurrence.catalog_project_id, occurrence.title,
    occurrence.starts_on, occurrence.ends_on, occurrence.primary_vessel_id,
    occurrence.primary_vessel_name, occurrence.status, occurrence.event_type, occurrence.source_label;
end;
$$;

revoke all on function public.planning_create_out_of_project(text, bigint, date) from public, anon, authenticated;
grant execute on function public.planning_create_out_of_project(text, bigint, date) to authenticated;
comment on function public.planning_create_out_of_project(text, bigint, date) is
  'Creates a one-day Planning operation with code HP using the existing Planning write permissions.';
