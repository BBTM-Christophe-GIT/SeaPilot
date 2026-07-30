drop policy if exists project_billing_services_manager_write on public.project_billing_services;

drop policy if exists project_billing_services_manager_insert on public.project_billing_services;
create policy project_billing_services_manager_insert on public.project_billing_services
  for insert to authenticated
  with check (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  );

drop policy if exists project_billing_services_manager_update on public.project_billing_services;
create policy project_billing_services_manager_update on public.project_billing_services
  for update to authenticated
  using (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  )
  with check (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  );

drop policy if exists project_billing_services_manager_delete on public.project_billing_services;
create policy project_billing_services_manager_delete on public.project_billing_services
  for delete to authenticated
  using (
    public.user_belongs_to_company(company_id)
    and public.has_any_role(array['admin', 'direction'])
  );

revoke all on table public.project_billing_services from authenticated;
grant select, insert, update, delete on table public.project_billing_services to authenticated;

create index if not exists project_billing_services_period_company_project_idx
  on public.project_billing_services (billing_period_id, company_id, project_id);
create index if not exists project_billing_services_company_idx
  on public.project_billing_services (company_id);
create index if not exists project_billing_services_created_by_idx
  on public.project_billing_services (created_by);
create index if not exists project_billing_services_updated_by_idx
  on public.project_billing_services (updated_by);
