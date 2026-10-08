-- Personal vehicle book; issued mileage notes retain their existing JSON snapshot.
create table public.expense_personal_vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null default public.current_planning_company_id() references public.companies(id),
  user_id uuid not null default auth.uid() references public.profiles(id),
  vehicle text not null check (length(btrim(vehicle)) between 1 and 150),
  fiscal_power text not null check (length(btrim(fiscal_power)) between 1 and 30),
  fuel text not null check (fuel in ('essence', 'diesel', 'hybrid', 'electric')),
  created_at timestamptz not null default now()
);
create index expense_personal_vehicles_owner_idx on public.expense_personal_vehicles(user_id, company_id);
create index expense_personal_vehicles_company_idx on public.expense_personal_vehicles(company_id);
alter table public.expense_personal_vehicles enable row level security;
revoke all on public.expense_personal_vehicles from anon, authenticated;
grant select, delete on public.expense_personal_vehicles to authenticated;
grant insert (vehicle, fiscal_power, fuel) on public.expense_personal_vehicles to authenticated;
grant update (vehicle, fiscal_power, fuel) on public.expense_personal_vehicles to authenticated;
grant all on public.expense_personal_vehicles to service_role;
create policy expense_personal_vehicles_owner on public.expense_personal_vehicles
for all to authenticated
using (
  user_id = (select auth.uid()) and public.user_belongs_to_company(company_id)
  and exists (select 1 from public.role_module_permissions p
    where p.module_key = 'expenseNotes' and p.is_visible and public.has_role(p.role_key))
)
with check (
  user_id = (select auth.uid()) and public.user_belongs_to_company(company_id)
  and exists (select 1 from public.role_module_permissions p
    where p.module_key = 'expenseNotes' and p.is_visible and public.has_role(p.role_key))
);
comment on table public.expense_personal_vehicles is 'Private vehicle book per account and active company. No relationship to immutable issued note snapshots.';
