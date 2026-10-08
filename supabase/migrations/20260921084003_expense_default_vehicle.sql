alter table public.expense_personal_vehicles add column is_default boolean not null default false;
create unique index expense_personal_vehicles_one_default_idx
  on public.expense_personal_vehicles(user_id, company_id) where is_default;
grant update (is_default) on public.expense_personal_vehicles to authenticated;

-- Invoker privileges preserve the existing owner/company/module RLS.
-- Serialize switches so two devices cannot leave two defaults or lose a valid choice.
create function public.set_expense_default_vehicle(p_vehicle_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  company bigint := public.current_planning_company_id();
begin
  if actor is null or not coalesce(public.user_belongs_to_company(company), false)
    or not exists (select 1 from public.role_module_permissions p
      where p.module_key='expenseNotes' and p.is_visible and public.has_role(p.role_key)) then
    raise exception 'Accès au carnet de véhicules refusé.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('expense-vehicle:' || actor::text || ':' || company::text, 0));
  if p_vehicle_id is not null then
    perform 1 from public.expense_personal_vehicles
      where id=p_vehicle_id and user_id=actor and company_id=company for update;
    if not found then raise exception 'Véhicule indisponible.' using errcode='42501'; end if;
  end if;
  update public.expense_personal_vehicles set is_default=false
    where user_id=actor and company_id=company and is_default;
  if p_vehicle_id is not null then
    update public.expense_personal_vehicles set is_default=true where id=p_vehicle_id;
  end if;
end; $$;
revoke all on function public.set_expense_default_vehicle(uuid) from public, anon;
grant execute on function public.set_expense_default_vehicle(uuid) to authenticated;
