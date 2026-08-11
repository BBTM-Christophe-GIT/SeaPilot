create index if not exists fleet_certificate_renewal_events_certificate_idx
  on public.fleet_certificate_renewal_events (certificate_id);
create index if not exists fleet_certificate_renewal_events_version_idx
  on public.fleet_certificate_renewal_events (version_id)
  where version_id is not null;
create index if not exists fleet_certificate_renewal_events_created_by_idx
  on public.fleet_certificate_renewal_events (created_by)
  where created_by is not null;
create index if not exists fleet_certificate_versions_uploaded_by_idx
  on public.fleet_certificate_versions (uploaded_by)
  where uploaded_by is not null;
create index if not exists fleet_certificate_versions_validated_by_idx
  on public.fleet_certificate_versions (validated_by)
  where validated_by is not null;

drop policy if exists fleet_certificate_versions_office_write on public.fleet_certificate_versions;
drop policy if exists fleet_certificate_versions_office_insert on public.fleet_certificate_versions;
drop policy if exists fleet_certificate_versions_office_update on public.fleet_certificate_versions;
drop policy if exists fleet_certificate_versions_office_delete on public.fleet_certificate_versions;
create policy fleet_certificate_versions_office_insert
on public.fleet_certificate_versions for insert to authenticated
with check (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
);
create policy fleet_certificate_versions_office_update
on public.fleet_certificate_versions for update to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
)
with check (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
);
create policy fleet_certificate_versions_office_delete
on public.fleet_certificate_versions for delete to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
);

drop policy if exists fleet_certificate_renewal_events_office_write on public.fleet_certificate_renewal_events;
drop policy if exists fleet_certificate_renewal_events_office_insert on public.fleet_certificate_renewal_events;
drop policy if exists fleet_certificate_renewal_events_office_update on public.fleet_certificate_renewal_events;
drop policy if exists fleet_certificate_renewal_events_office_delete on public.fleet_certificate_renewal_events;
create policy fleet_certificate_renewal_events_office_insert
on public.fleet_certificate_renewal_events for insert to authenticated
with check (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
);
create policy fleet_certificate_renewal_events_office_update
on public.fleet_certificate_renewal_events for update to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
)
with check (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
);
create policy fleet_certificate_renewal_events_office_delete
on public.fleet_certificate_renewal_events for delete to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
);

drop policy if exists fleet_certificates_company_office_write on public.fleet_certificates;
drop policy if exists fleet_certificates_company_office_insert on public.fleet_certificates;
drop policy if exists fleet_certificates_company_office_update on public.fleet_certificates;
drop policy if exists fleet_certificates_company_office_delete on public.fleet_certificates;
create policy fleet_certificates_company_office_insert
on public.fleet_certificates for insert to authenticated
with check (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
);
create policy fleet_certificates_company_office_update
on public.fleet_certificates for update to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
)
with check (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
);
create policy fleet_certificates_company_office_delete
on public.fleet_certificates for delete to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
);
