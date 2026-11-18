create table public.organigramme_card_settings (
  company_id bigint not null,
  chart_id bigint not null,
  person_id bigint not null,
  color text check (color in ('pink', 'peach', 'yellow', 'green', 'blue', 'lavender')),
  temporary_function_label text check (
    length(temporary_function_label) between 1 and 300
    and temporary_function_label = btrim(temporary_function_label)
  ),
  primary key (company_id, chart_id, person_id),
  foreign key (company_id, chart_id) references public.organigramme_charts (company_id, id) on delete cascade,
  foreign key (person_id, company_id) references public.people (id, company_id) on delete cascade
);

alter table public.organigramme_card_settings enable row level security;
revoke all on public.organigramme_card_settings from public, anon, authenticated;
grant select, insert, delete on public.organigramme_card_settings to authenticated;
grant update (color, temporary_function_label) on public.organigramme_card_settings to authenticated;

create policy organigramme_card_settings_read on public.organigramme_card_settings
  for select to authenticated using (public.organigramme_has_access(company_id));
create policy organigramme_card_settings_insert on public.organigramme_card_settings
  for insert to authenticated with check (private.organigramme_person_allowed(company_id, person_id));
create policy organigramme_card_settings_update on public.organigramme_card_settings
  for update to authenticated using (public.organigramme_has_access(company_id))
  with check (private.organigramme_person_allowed(company_id, person_id));
create policy organigramme_card_settings_delete on public.organigramme_card_settings
  for delete to authenticated using (public.organigramme_has_access(company_id));

create function public.save_organigramme_card_setting(
  p_chart_id bigint, p_person_id bigint, p_field text, p_value text
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  company bigint := public.current_planning_company_id();
  setting_value text := nullif(btrim(p_value), '');
begin
  if private.organigramme_person_allowed(company, p_person_id) is not true then
    raise exception 'Collaborateur indisponible.' using errcode = '42501';
  end if;
  if p_field is null or p_field not in ('color', 'temporary_function') then
    raise exception 'Réglage inconnu.' using errcode = '22023';
  end if;
  perform 1 from public.organigramme_charts where company_id = company and id = p_chart_id for update;
  if not found then raise exception 'Organigramme introuvable.' using errcode = 'P0002'; end if;

  insert into public.organigramme_card_settings as existing (
    company_id, chart_id, person_id, color, temporary_function_label
  ) values (
    company, p_chart_id, p_person_id,
    case when p_field = 'color' then setting_value end,
    case when p_field = 'temporary_function' then setting_value end
  )
  on conflict (company_id, chart_id, person_id) do update set
    color = case when p_field = 'color' then excluded.color else existing.color end,
    temporary_function_label = case when p_field = 'temporary_function'
      then excluded.temporary_function_label else existing.temporary_function_label end;

  delete from public.organigramme_card_settings
  where company_id = company and chart_id = p_chart_id and person_id = p_person_id
    and color is null and temporary_function_label is null;
end;
$$;

create function public.organigramme_snapshot_v4(p_chart_id bigint, p_as_of date default current_date)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select public.organigramme_snapshot_v3(p_chart_id, p_as_of) || (
    select jsonb_build_object(
      'cardColors', coalesce(jsonb_object_agg(person_id, color) filter (where color is not null), '{}'::jsonb),
      'temporaryFunctions', coalesce(jsonb_object_agg(person_id, temporary_function_label)
        filter (where temporary_function_label is not null), '{}'::jsonb)
    )
    from public.organigramme_card_settings
    where company_id = public.current_planning_company_id() and chart_id = p_chart_id
  );
$$;

revoke all on function public.save_organigramme_card_setting(bigint, bigint, text, text),
  public.organigramme_snapshot_v4(bigint, date) from public, anon;
grant execute on function public.save_organigramme_card_setting(bigint, bigint, text, text),
  public.organigramme_snapshot_v4(bigint, date) to authenticated;

-- A copy carries the pastel colors. Temporary labels belong to the source version.
create or replace function public.duplicate_organigramme_chart(p_chart_id bigint, p_name text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  company bigint := public.current_planning_company_id();
  copy_id bigint;
  source_watches public.organigramme_watches[];
  source_members public.organigramme_watch_members[];
  source_support public.organigramme_support[];
  source_categories public.organigramme_categories[];
  source_links public.organigramme_links[];
  source_colors public.organigramme_card_settings[];
  responsibility public.organigramme_support;
  responsibility_id bigint;
  support_ids jsonb := '{}'::jsonb;
begin
  if public.organigramme_has_access(company) is not true then
    raise exception 'Accès refusé à l’organigramme.' using errcode = '42501';
  end if;
  perform 1 from public.organigramme_charts where company_id = company and id = p_chart_id for update;
  if not found then raise exception 'Organigramme introuvable.' using errcode = 'P0002'; end if;

  with watches as materialized (
    select w as row from public.organigramme_watches w
    join public.vessels v on v.company_id = w.company_id and v.id = w.vessel_id and v.asset_kind = 'vessel'
    where w.company_id = company and w.chart_id = p_chart_id
  )
  select
    array(select row from watches),
    array(select m from public.organigramme_watch_members m join watches w on (w.row).id = m.watch_id where m.company_id = company),
    array(select s from public.organigramme_support s where s.company_id = company and s.chart_id = p_chart_id order by s.id),
    array(select c from public.organigramme_categories c where c.company_id = company and c.chart_id = p_chart_id),
    array(select l from public.organigramme_links l where l.company_id = company and l.chart_id = p_chart_id
      and public.organigramme_target_allowed(company, p_chart_id, l.target_kind, l.target_key, l.target_section) order by l.id),
    array(select c from public.organigramme_card_settings c where c.company_id = company and c.chart_id = p_chart_id and c.color is not null)
  into source_watches, source_members, source_support, source_categories, source_links, source_colors;

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

  insert into public.organigramme_links (company_id, chart_id, source_category, target_kind, target_key, target_section, label)
  select company, copy_id, l.source_category, l.target_kind,
    case when l.target_kind = 'person' and left(l.target_key, 1) = '-'
      then '-' || (support_ids ->> substr(l.target_key, 2)) else l.target_key end,
    l.target_section, l.label
  from unnest(source_links) l order by l.id;

  insert into public.organigramme_card_settings (company_id, chart_id, person_id, color)
  select company, copy_id, c.person_id, c.color from unnest(source_colors) c;

  return copy_id;
end;
$$;

notify pgrst, 'reload schema';
