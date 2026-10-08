-- Display only: assignment data, publication scopes and permissions are unchanged.
create table public.planning_display_settings (
  company_id bigint primary key references public.companies(id) on delete cascade,
  active_filter_enabled boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.planning_display_settings (company_id)
select id from public.companies;

alter table public.planning_display_settings enable row level security;
revoke all on public.planning_display_settings from public, anon, authenticated;
grant select on public.planning_display_settings to authenticated;
grant insert (company_id, active_filter_enabled, updated_by, updated_at),
  update (active_filter_enabled, updated_by, updated_at)
  on public.planning_display_settings to authenticated;

create policy planning_display_settings_read
on public.planning_display_settings for select to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and public.has_company_role(company_id, array['admin','direction','armement','capitaine','marin'])
);

create policy planning_display_settings_insert
on public.planning_display_settings for insert to authenticated
with check (
  company_id = (select public.current_planning_company_id())
  and public.has_company_role(company_id, array['admin'])
);

create policy planning_display_settings_update
on public.planning_display_settings for update to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and public.has_company_role(company_id, array['admin'])
)
with check (
  company_id = (select public.current_planning_company_id())
  and public.has_company_role(company_id, array['admin'])
);

create function public.planning_save_display_settings(p_active_filter_enabled boolean)
returns public.planning_display_settings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  saved public.planning_display_settings;
begin
  if (select auth.uid()) is null or target_company_id is null
     or not public.has_company_role(target_company_id, array['admin']) then
    raise exception 'Seul un administrateur peut modifier les réglages du Planning.' using errcode = '42501';
  end if;

  insert into public.planning_display_settings (company_id, active_filter_enabled, updated_by, updated_at)
  values (target_company_id, coalesce(p_active_filter_enabled, false), (select auth.uid()), clock_timestamp())
  on conflict (company_id) do update set
    active_filter_enabled = excluded.active_filter_enabled,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into saved;
  return saved;
end;
$$;

revoke all on function public.planning_save_display_settings(boolean) from public, anon, authenticated;
grant execute on function public.planning_save_display_settings(boolean) to authenticated;

comment on table public.planning_display_settings is 'Company Planning display preferences; disabled by default. Column highlights are never persisted.';
