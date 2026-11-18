create or replace function public.move_organigramme_watch_member(
  p_chart_id bigint, p_person_id bigint, p_from_watch_id bigint, p_to_vessel_id bigint, p_to_watch_id bigint
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  company bigint := public.current_planning_company_id();
  today date := (now() at time zone 'Europe/Paris')::date;
  destination bigint := p_to_watch_id;
  at_source boolean;
begin
  if public.organigramme_has_access(company) is not true then
    raise exception 'Accès refusé à l’organigramme.' using errcode = '42501';
  end if;
  -- All watch edits for this chart use the same lock, including full saves.
  perform 1 from public.organigramme_charts where company_id = company and id = p_chart_id for update;
  if not found then raise exception 'Organigramme introuvable.' using errcode = 'P0002'; end if;

  if p_from_watch_id is not null and not exists (
    select 1 from public.organigramme_watches
    where id = p_from_watch_id and company_id = company and chart_id = p_chart_id
  ) then raise exception 'Bordée de départ introuvable.' using errcode = 'P0002'; end if;
  if not exists (
    select 1 from public.vessels
    where id = p_to_vessel_id and company_id = company and asset_kind = 'vessel' and active
      and (fleet_exit_on is null or fleet_exit_on > today)
  ) then raise exception 'Navire indisponible.' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.people
    where id = p_person_id and company_id = company and active and (hired_on is null or hired_on <= today)
      and (departed_on is null or departed_on > today)
      and (p_from_watch_id is not null or employment_population is distinct from 'sedentary')
      and not exists (
        select 1 from private.people_directory_aliases alias
        where alias.company_id = company and alias.alias_person_id = p_person_id
      )
  ) then raise exception 'Personne indisponible dans cette société.' using errcode = '42501'; end if;

  select exists (
    select 1 from public.organigramme_watch_members
    where company_id = company and watch_id = p_from_watch_id and person_id = p_person_id
  ) into at_source;
  if destination is null then
    if exists (
      select 1 from public.organigramme_watches
      where company_id = company and chart_id = p_chart_id and vessel_id = p_to_vessel_id
    ) then
      -- A retry can succeed after the same drop created the first watch.
      if not at_source and exists (
        select 1 from public.organigramme_watches watch
        join public.organigramme_watch_members member on member.watch_id = watch.id and member.company_id = watch.company_id
        where watch.company_id = company and watch.chart_id = p_chart_id and watch.vessel_id = p_to_vessel_id
          and watch.name = 'Bordée 1' and member.person_id = p_person_id
      ) then return; end if;
      raise exception 'Choisissez une bordée existante.' using errcode = '22023';
    end if;
    insert into public.organigramme_watches (company_id, chart_id, vessel_id, name)
    values (company, p_chart_id, p_to_vessel_id, 'Bordée 1')
    returning id into destination;
  elsif not exists (
    select 1 from public.organigramme_watches
    where id = destination and company_id = company and chart_id = p_chart_id and vessel_id = p_to_vessel_id
  ) then raise exception 'Bordée de destination introuvable.' using errcode = 'P0002'; end if;

  if not at_source then
    if exists (
      select 1 from public.organigramme_watch_members
      where company_id = company and watch_id = destination and person_id = p_person_id
    ) then return; end if;
    if p_from_watch_id is not null then
      raise exception 'Ce collaborateur ne fait plus partie de la bordée de départ.' using errcode = 'P0002';
    end if;
    if exists (
      select 1 from public.organigramme_watch_members member
      join public.organigramme_watches watch on watch.id = member.watch_id and watch.company_id = member.company_id
      where member.company_id = company and member.person_id = p_person_id and watch.chart_id = p_chart_id
    ) then raise exception 'Ce collaborateur figure déjà dans une autre bordée.' using errcode = '23505'; end if;
  end if;

  if destination = p_from_watch_id then return; end if;
  update public.organigramme_watches
  set revision = revision + 1
  where company_id = company and chart_id = p_chart_id and id in (p_from_watch_id, destination);
  if p_from_watch_id is null then
    insert into public.organigramme_watch_members (company_id, watch_id, person_id)
    values (company, destination, p_person_id);
  else
    update public.organigramme_watch_members
    set watch_id = destination
    where company_id = company and watch_id = p_from_watch_id and person_id = p_person_id;
    if not found then
      raise exception 'Ce collaborateur ne fait plus partie de la bordée de départ.' using errcode = 'P0002';
    end if;
  end if;
end;
$$;

revoke all on function public.move_organigramme_watch_member(bigint,bigint,bigint,bigint,bigint) from public, anon;
grant execute on function public.move_organigramme_watch_member(bigint,bigint,bigint,bigint,bigint) to authenticated;
comment on function public.move_organigramme_watch_member(bigint,bigint,bigint,bigint,bigint)
  is 'Atomically assigns an unassigned crew member or moves a member between watches within one chart.';
