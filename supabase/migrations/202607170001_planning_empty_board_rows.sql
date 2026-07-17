-- Persist optional sailor rows independently from colored Planning events.
-- These rows are reserved for people whose HR departure date is in the past.

create table if not exists public.planning_board_rows (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade default public.current_planning_company_id(),
  vessel_id bigint not null references public.vessels(id) on delete cascade,
  person_id bigint not null references public.people(id) on delete cascade,
  watch_group text not null,
  function_label text,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_board_rows_watch_group_check check (length(trim(watch_group)) > 0),
  constraint planning_board_rows_unique unique (company_id, vessel_id, watch_group, person_id)
);

create index if not exists planning_board_rows_vessel_group_idx
  on public.planning_board_rows (company_id, vessel_id, watch_group, created_at);

alter table public.planning_board_rows enable row level security;

revoke all on public.planning_board_rows from public, anon, authenticated;
grant select on public.planning_board_rows to authenticated;

drop policy if exists planning_board_rows_read on public.planning_board_rows;
create policy planning_board_rows_read on public.planning_board_rows
  for select to authenticated
  using ((select public.planning_can_read_row(company_id, vessel_id, person_id, null, null)));

create or replace function public.add_planning_board_row(
  p_vessel_id bigint,
  p_watch_group text,
  p_person_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_person public.people%rowtype;
  target_person_name text;
  normalized_watch_group text := trim(coalesce(p_watch_group, ''));
  saved_id bigint;
begin
  if target_company_id is null
    or not public.planning_user_can('edit_event', target_company_id, p_vessel_id, null, null) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: ajout d''une ligne de bordée.';
  end if;

  if normalized_watch_group = '' then
    raise exception using errcode = '22023', message = 'PLANNING_VALIDATION: la bordée est obligatoire.';
  end if;

  if not exists (
    select 1 from public.vessels vessel
    where vessel.id = p_vessel_id and vessel.company_id = target_company_id
  ) then
    raise exception using errcode = 'P0002', message = 'PLANNING_STALE_DATA: navire introuvable.';
  end if;

  select person.* into target_person
  from public.people person
  where person.id = p_person_id and person.company_id = target_company_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'PLANNING_STALE_DATA: marin introuvable.';
  end if;

  if target_person.departed_on is null or target_person.departed_on >= current_date then
    raise exception using errcode = '22023', message = 'PLANNING_VALIDATION: seuls les marins dont la date de départ est antérieure à aujourd''hui peuvent être ajoutés comme ligne vide.';
  end if;

  target_person_name := trim(concat_ws(' ', target_person.first_name, target_person.last_name));

  if exists (
      select 1 from public.planning_assignments assignment
      where assignment.company_id = target_company_id
        and assignment.vessel_id = p_vessel_id
        and assignment.crew_person_id = p_person_id
        and assignment.watch_group = normalized_watch_group
    ) or exists (
      select 1 from public.planning_periods period
      where period.company_id = target_company_id
        and period.vessel_id = p_vessel_id
        and period.watch_group = normalized_watch_group
        and (period.person_id = p_person_id or lower(trim(period.crew_name)) = lower(target_person_name))
    ) or exists (
      select 1 from public.planning_days day_row
      where day_row.company_id = target_company_id
        and day_row.vessel_id = p_vessel_id
        and day_row.watch_group = normalized_watch_group
        and (day_row.person_id = p_person_id or lower(trim(day_row.crew_name)) = lower(target_person_name))
    ) then
    raise exception using errcode = '23505', message = 'PLANNING_BOARD_ROW_ALREADY_PRESENT: ce marin possède déjà un enregistrement sur cette ligne.';
  end if;

  insert into public.planning_board_rows (
    company_id, vessel_id, person_id, watch_group, function_label, created_by
  ) values (
    target_company_id,
    p_vessel_id,
    p_person_id,
    normalized_watch_group,
    coalesce(nullif(trim(target_person.function_label), ''), nullif(trim(target_person.grade_label), ''), 'Équipage'),
    auth.uid()
  )
  on conflict (company_id, vessel_id, watch_group, person_id)
  do update set
    function_label = excluded.function_label,
    updated_at = now()
  returning id into saved_id;

  return saved_id;
end;
$$;

create or replace function public.delete_planning_board_row(p_row_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.planning_board_rows%rowtype;
  target_person_name text;
begin
  select board_row.*
  into target
  from public.planning_board_rows board_row
  where board_row.id = p_row_id
    and board_row.company_id = public.current_planning_company_id();

  if not found then
    raise exception using errcode = 'P0002', message = 'PLANNING_STALE_DATA: ligne introuvable.';
  end if;

  select trim(concat_ws(' ', person.first_name, person.last_name))
  into target_person_name
  from public.people person
  where person.id = target.person_id and person.company_id = target.company_id;

  if not public.planning_user_can('edit_event', target.company_id, target.vessel_id, null, null) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: suppression d''une ligne de bordée.';
  end if;

  if exists (
      select 1 from public.planning_assignments assignment
      where assignment.company_id = target.company_id
        and assignment.vessel_id = target.vessel_id
        and assignment.crew_person_id = target.person_id
        and assignment.watch_group = target.watch_group
    ) or exists (
      select 1 from public.planning_periods period
      where period.company_id = target.company_id
        and period.vessel_id = target.vessel_id
        and period.watch_group = target.watch_group
        and (period.person_id = target.person_id or lower(trim(period.crew_name)) = lower(target_person_name))
    ) or exists (
      select 1 from public.planning_days day_row
      where day_row.company_id = target.company_id
        and day_row.vessel_id = target.vessel_id
        and day_row.watch_group = target.watch_group
        and (day_row.person_id = target.person_id or lower(trim(day_row.crew_name)) = lower(target_person_name))
    ) then
    raise exception using errcode = '23503', message = 'PLANNING_BOARD_ROW_NOT_EMPTY: cette ligne contient au moins un enregistrement.';
  end if;

  delete from public.planning_board_rows where id = target.id;
  return target.id;
end;
$$;

revoke all on function public.add_planning_board_row(bigint, text, bigint) from public, anon;
revoke all on function public.delete_planning_board_row(bigint) from public, anon;
grant execute on function public.add_planning_board_row(bigint, text, bigint) to authenticated;
grant execute on function public.delete_planning_board_row(bigint) to authenticated;

comment on table public.planning_board_rows is
  'Optional empty Planning rows for departed sailors, independent from colored day and period records.';
comment on function public.add_planning_board_row(bigint, text, bigint) is
  'Adds a departed sailor as an empty row in one vessel watch group.';
comment on function public.delete_planning_board_row(bigint) is
  'Deletes an optional board row only while it has no assignment, period or day record.';
