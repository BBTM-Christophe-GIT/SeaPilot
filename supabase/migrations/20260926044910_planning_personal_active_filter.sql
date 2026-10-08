-- A missing personal choice inherits the company default.
create table public.planning_personal_display_settings (
  company_id bigint not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  active_filter_enabled boolean not null,
  primary key (company_id, user_id)
);
alter table public.planning_personal_display_settings enable row level security;
revoke all on public.planning_personal_display_settings from public, anon, authenticated;
grant select, insert, update on public.planning_personal_display_settings to authenticated;
create policy personal_planning_settings on public.planning_personal_display_settings
for all to authenticated using (
  user_id = (select auth.uid()) and company_id = public.current_planning_company_id()
  and public.has_company_role(company_id, array['admin','direction','armement','capitaine','marin'])
) with check (
  user_id = (select auth.uid()) and company_id = public.current_planning_company_id()
  and public.has_company_role(company_id, array['admin','direction','armement','capitaine','marin'])
);
create function public.planning_save_personal_display_settings(p_active_filter_enabled boolean)
returns public.planning_personal_display_settings
language plpgsql security invoker set search_path = '' as $$
declare saved public.planning_personal_display_settings;
begin
  insert into public.planning_personal_display_settings(company_id,user_id,active_filter_enabled)
  values (public.current_planning_company_id(),auth.uid(),p_active_filter_enabled)
  on conflict(company_id,user_id) do update set active_filter_enabled=excluded.active_filter_enabled
  returning * into saved;
  return saved;
end;
$$;
revoke all on function public.planning_save_personal_display_settings(boolean) from public, anon;
grant execute on function public.planning_save_personal_display_settings(boolean) to authenticated;
