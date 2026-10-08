-- Personal preferences, isolated by administrator and active company.
create table public.planning_crew_display_preferences (
  company_id bigint not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name_format text not null default 'first_last' check (name_format in ('first_last', 'last_first')),
  sort_order text not null default 'period' check (sort_order in ('period', 'last_name', 'function')),
  primary key (company_id, user_id)
);

alter table public.planning_crew_display_preferences enable row level security;
revoke all on public.planning_crew_display_preferences from public, anon, authenticated;
grant select, insert, update on public.planning_crew_display_preferences to authenticated;

create policy crew_preferences_admin_read on public.planning_crew_display_preferences
for select to authenticated using (
  user_id = (select auth.uid())
  and company_id = public.current_planning_company_id()
  and public.has_company_role(company_id, array['admin'])
);
create policy crew_preferences_admin_insert on public.planning_crew_display_preferences
for insert to authenticated with check (
  user_id = (select auth.uid())
  and company_id = public.current_planning_company_id()
  and public.has_company_role(company_id, array['admin'])
);
create policy crew_preferences_admin_update on public.planning_crew_display_preferences
for update to authenticated using (
  user_id = (select auth.uid())
  and company_id = public.current_planning_company_id()
  and public.has_company_role(company_id, array['admin'])
) with check (
  user_id = (select auth.uid())
  and company_id = public.current_planning_company_id()
  and public.has_company_role(company_id, array['admin'])
);

create function public.planning_save_crew_display_preferences(p_name_format text, p_sort_order text)
returns public.planning_crew_display_preferences
language plpgsql security invoker set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  saved public.planning_crew_display_preferences;
begin
  if auth.uid() is null or not public.has_company_role(target_company_id, array['admin']) then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;
  insert into public.planning_crew_display_preferences(company_id, user_id, name_format, sort_order)
  values (target_company_id, auth.uid(), p_name_format, p_sort_order)
  on conflict (company_id, user_id) do update
  set name_format = excluded.name_format, sort_order = excluded.sort_order
  returning * into saved;
  return saved;
end;
$$;
revoke all on function public.planning_save_crew_display_preferences(text, text) from public, anon;
grant execute on function public.planning_save_crew_display_preferences(text, text) to authenticated;
