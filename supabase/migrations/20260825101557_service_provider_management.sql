-- Manager-facing supplier directory and catalog maintenance.
-- Existing company-scoped read policies remain unchanged for operational flows.

drop policy if exists service_providers_manager_insert on public.service_providers;
create policy service_providers_manager_insert
on public.service_providers for insert to authenticated
with check (
  (select public.user_belongs_to_company(company_id))
  and (select public.has_any_role(array['admin', 'direction']))
);

drop policy if exists service_providers_manager_update on public.service_providers;
create policy service_providers_manager_update
on public.service_providers for update to authenticated
using (
  (select public.user_belongs_to_company(company_id))
  and (select public.has_any_role(array['admin', 'direction']))
)
with check (
  (select public.user_belongs_to_company(company_id))
  and (select public.has_any_role(array['admin', 'direction']))
);

drop policy if exists service_provider_specialties_manager_insert on public.service_provider_specialties;
create policy service_provider_specialties_manager_insert
on public.service_provider_specialties for insert to authenticated
with check (
  (select public.user_belongs_to_company(company_id))
  and (select public.has_any_role(array['admin', 'direction']))
  and exists (
    select 1
    from public.service_providers provider
    where provider.id = service_provider_specialties.provider_id
      and provider.company_id = service_provider_specialties.company_id
      and provider.merged_into_provider_id is null
  )
);

drop policy if exists service_provider_specialties_manager_update on public.service_provider_specialties;
create policy service_provider_specialties_manager_update
on public.service_provider_specialties for update to authenticated
using (
  (select public.user_belongs_to_company(company_id))
  and (select public.has_any_role(array['admin', 'direction']))
)
with check (
  (select public.user_belongs_to_company(company_id))
  and (select public.has_any_role(array['admin', 'direction']))
  and exists (
    select 1
    from public.service_providers provider
    where provider.id = service_provider_specialties.provider_id
      and provider.company_id = service_provider_specialties.company_id
      and provider.merged_into_provider_id is null
  )
);

drop policy if exists service_provider_contacts_manager_insert on public.service_provider_contacts;
create policy service_provider_contacts_manager_insert
on public.service_provider_contacts for insert to authenticated
with check (
  (select public.user_belongs_to_company(company_id))
  and (select public.has_any_role(array['admin', 'direction']))
  and exists (
    select 1
    from public.service_providers provider
    where provider.id = service_provider_contacts.provider_id
      and provider.company_id = service_provider_contacts.company_id
      and provider.merged_into_provider_id is null
  )
);

drop policy if exists service_provider_contacts_manager_update on public.service_provider_contacts;
create policy service_provider_contacts_manager_update
on public.service_provider_contacts for update to authenticated
using (
  (select public.user_belongs_to_company(company_id))
  and (select public.has_any_role(array['admin', 'direction']))
)
with check (
  (select public.user_belongs_to_company(company_id))
  and (select public.has_any_role(array['admin', 'direction']))
  and exists (
    select 1
    from public.service_providers provider
    where provider.id = service_provider_contacts.provider_id
      and provider.company_id = service_provider_contacts.company_id
      and provider.merged_into_provider_id is null
  )
);

grant insert, update on public.service_providers,
  public.service_provider_specialties,
  public.service_provider_contacts to authenticated;
grant usage, select on sequence public.service_providers_id_seq,
  public.service_provider_specialties_id_seq,
  public.service_provider_contacts_id_seq to authenticated;

with module_default as (
  select
    role.key as role_key,
    'serviceProviders'::text as module_key,
    role.key = any(array['admin', 'direction']::text[]) as is_visible
  from public.roles role
)
insert into public.role_module_permissions (role_key, module_key, is_visible)
select role_key, module_key, is_visible
from module_default
on conflict (role_key, module_key) do nothing;

comment on column public.project_chargeable_expenses.chargeable is
  'Legacy compatibility flag. SeaPilot includes expenses through the billing-period PDF selection.';
comment on column public.project_chargeable_expenses.included_in_client_invoice is
  'Legacy compatibility flag. SeaPilot no longer exposes or evaluates this field.';
