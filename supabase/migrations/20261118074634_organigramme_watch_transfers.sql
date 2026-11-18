create function public.move_organigramme_watch_member(
  p_chart_id bigint, p_person_id bigint, p_from_watch_id bigint, p_to_vessel_id bigint, p_to_watch_id bigint
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  company bigint := public.current_planning_company_id();
  today date := (now() at time zone 'Europe/Paris')::date;
  destination bigint := p_to_watch_id;
  at_source boolean;
begin
  if not public.organigramme_has_access(company) then
    raise exception 'Accès refusé à l’organigramme.' using errcode = '42501';
  end if;
  -- Serialize against full watch saves in the same chart.
  perform 1 from public.organigramme_charts where company_id = company and id = p_chart_id for update;
  if not found then raise exception 'Organigramme introuvable.' using errcode = 'P0002'; end if;

  if not exists (
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
      -- A retry can succeed after the same transfer created the first watch.
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
    raise exception 'Ce collaborateur ne fait plus partie de la bordée de départ.' using errcode = 'P0002';
  end if;

  if destination = p_from_watch_id then return; end if;
  update public.organigramme_watches
  set revision = revision + 1
  where company_id = company and chart_id = p_chart_id and id in (p_from_watch_id, destination);
  update public.organigramme_watch_members
  set watch_id = destination
  where company_id = company and watch_id = p_from_watch_id and person_id = p_person_id;
  if not found then
    raise exception 'Ce collaborateur ne fait plus partie de la bordée de départ.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.move_organigramme_watch_member(bigint,bigint,bigint,bigint,bigint) from public, anon;
grant execute on function public.move_organigramme_watch_member(bigint,bigint,bigint,bigint,bigint) to authenticated;
comment on function public.move_organigramme_watch_member(bigint,bigint,bigint,bigint,bigint)
  is 'Atomically moves one member between vessel watches in a single organigramme, preserving the watch function override.';
