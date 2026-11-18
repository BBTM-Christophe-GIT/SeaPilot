create function public.duplicate_organigramme_chart(p_chart_id bigint, p_name text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  company bigint := public.current_planning_company_id();
  copy_id bigint;
  source_watches public.organigramme_watches[];
  source_members public.organigramme_watch_members[];
  source_support public.organigramme_support[];
  source_categories public.organigramme_categories[];
  source_links public.organigramme_links[];
  responsibility public.organigramme_support;
  responsibility_id bigint;
  support_ids jsonb := '{}'::jsonb;
begin
  if public.organigramme_has_access(company) is not true then
    raise exception 'Accès refusé à l’organigramme.' using errcode = '42501';
  end if;
  -- Use the same source chart lock as watch saves and moves.
  perform 1 from public.organigramme_charts where company_id = company and id = p_chart_id for update;
  if not found then raise exception 'Organigramme introuvable.' using errcode = 'P0002'; end if;

  -- Capture the entire saved structure from one database snapshot, independently of the preview date.
  with watches as materialized (
    select w as source_watch from public.organigramme_watches w
    join public.vessels v on v.company_id = w.company_id and v.id = w.vessel_id and v.asset_kind = 'vessel'
    where w.company_id = company and w.chart_id = p_chart_id
  )
  select
    array(select source_watch from watches),
    array(select m from public.organigramme_watch_members m join watches w on (w.source_watch).id = m.watch_id where m.company_id = company),
    array(select s from public.organigramme_support s where s.company_id = company and s.chart_id = p_chart_id order by s.id),
    array(select c from public.organigramme_categories c where c.company_id = company and c.chart_id = p_chart_id),
    array(select l from public.organigramme_links l where l.company_id = company and l.chart_id = p_chart_id
      and public.organigramme_target_allowed(company, p_chart_id, l.target_kind, l.target_key, l.target_section) order by l.id)
  into source_watches, source_members, source_support, source_categories, source_links;

  insert into public.organigramme_charts (company_id, name)
  values (company, btrim(p_name)) returning id into copy_id;

  insert into public.organigramme_watches (company_id, chart_id, vessel_id, name)
  select company, copy_id, w.vessel_id, w.name from unnest(source_watches) w order by w.id;

  insert into public.organigramme_watch_members (company_id, watch_id, person_id, function_label)
  select company, copied_watch.id, m.person_id, m.function_label from unnest(source_members) m
  join unnest(source_watches) origin on origin.id = m.watch_id
  join public.organigramme_watches copied_watch on copied_watch.company_id = company and copied_watch.chart_id = copy_id
    and copied_watch.vessel_id = origin.vessel_id and copied_watch.name = origin.name;

  insert into public.organigramme_categories (company_id, chart_id, key, label)
  select company, copy_id, c.key, c.label from unnest(source_categories) c;

  foreach responsibility in array source_support loop
    insert into public.organigramme_support (company_id, chart_id, person_id, name, function_label, category, position, hierarchy_rank)
    values (company, copy_id, responsibility.person_id, responsibility.name, responsibility.function_label,
      responsibility.category, responsibility.position, responsibility.hierarchy_rank)
    returning id into responsibility_id;
    support_ids := support_ids || jsonb_build_object(responsibility.id::text, responsibility_id);
  end loop;

  -- Links to HR, categories and watch groups use shared IDs or names. Free-text support links store a negative support row ID.
  insert into public.organigramme_links (company_id, chart_id, source_category, target_kind, target_key, target_section, label)
  select company, copy_id, l.source_category, l.target_kind,
    case when l.target_kind = 'person' and left(l.target_key, 1) = '-'
      then '-' || (support_ids ->> substr(l.target_key, 2)) else l.target_key end,
    l.target_section, l.label
  from unnest(source_links) l order by l.id;

  return copy_id;
end;
$$;

revoke all on function public.duplicate_organigramme_chart(bigint, text) from public, anon;
grant execute on function public.duplicate_organigramme_chart(bigint, text) to authenticated;
notify pgrst, 'reload schema';
