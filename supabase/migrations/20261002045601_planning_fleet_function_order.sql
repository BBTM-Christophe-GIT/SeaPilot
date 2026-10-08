-- Administration controls only the order of crew functions inside fleet watches.
-- An empty order preserves the existing planning display until an administrator saves it.

create table public.planning_fleet_display_settings (
  company_id bigint primary key references public.companies(id) on delete cascade,
  function_order text[] not null default '{}'::text[],
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint planning_fleet_function_order_shape_check
    check (coalesce(array_ndims(function_order), 1) = 1)
);

create index planning_fleet_display_settings_updated_by_idx
  on public.planning_fleet_display_settings(updated_by);

insert into public.planning_fleet_display_settings(company_id)
select company.id from public.companies company;

alter table public.planning_fleet_display_settings enable row level security;
revoke all on public.planning_fleet_display_settings from public, anon, authenticated;
grant select, insert, update on public.planning_fleet_display_settings to authenticated;

create policy planning_fleet_display_settings_company_read
on public.planning_fleet_display_settings for select to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and public.has_company_role(company_id, array['admin', 'direction', 'armement', 'capitaine', 'marin'])
);

create policy planning_fleet_display_settings_admin_insert
on public.planning_fleet_display_settings for insert to authenticated
with check (
  company_id = (select public.current_planning_company_id())
  and public.has_company_role(company_id, array['admin'])
);

create policy planning_fleet_display_settings_admin_update
on public.planning_fleet_display_settings for update to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and public.has_company_role(company_id, array['admin'])
)
with check (
  company_id = (select public.current_planning_company_id())
  and public.has_company_role(company_id, array['admin'])
);

create function public.save_planning_fleet_display_settings(p_function_order text[])
returns public.planning_fleet_display_settings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  normalized_order text[];
  saved public.planning_fleet_display_settings;
begin
  if (select auth.uid()) is null
     or target_company_id is null
     or not public.has_company_role(target_company_id, array['admin']) then
    raise exception 'Seul un administrateur peut modifier l''ordre des fonctions dans la vue flotte.' using errcode = '42501';
  end if;

  if p_function_order is null or coalesce(array_ndims(p_function_order), 1) <> 1 then
    raise exception 'L''ordre des fonctions doit être une liste.' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(p_function_order) item(label)
    where item.label is null or btrim(item.label) = ''
  ) then
    raise exception 'Chaque fonction doit avoir un libellé.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_function_order) item(label)
    group by translate(lower(regexp_replace(btrim(item.label), '\s+', ' ', 'g')), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc')
    having count(*) > 1
  ) then
    raise exception 'Une fonction ne peut apparaître qu''une fois dans l''ordre.' using errcode = '22023';
  end if;

  select coalesce(array_agg(btrim(item.label) order by item.position), '{}'::text[])
  into normalized_order
  from unnest(p_function_order) with ordinality item(label, position);

  insert into public.planning_fleet_display_settings(company_id, function_order, updated_by, updated_at)
  values (target_company_id, normalized_order, (select auth.uid()), clock_timestamp())
  on conflict (company_id) do update set
    function_order = excluded.function_order,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into saved;

  return saved;
end;
$$;

revoke all on function public.save_planning_fleet_display_settings(text[]) from public, anon, authenticated;
grant execute on function public.save_planning_fleet_display_settings(text[]) to authenticated;

comment on table public.planning_fleet_display_settings is
  'Company-scoped crew display configuration used only inside watches in the planning fleet view.';
comment on column public.planning_fleet_display_settings.function_order is
  'Ordered function labels shared by permanent HR functions and temporary planning functions; empty means existing display order.';

notify pgrst, 'reload schema';
