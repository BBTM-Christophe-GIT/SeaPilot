-- Add preparation/follow-up access only to readers. Preserve all existing
-- company, personal, write, validation and upload capabilities.
create function private.can_read_lifting_vessel(p_company_id bigint, p_vessel_id bigint)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(public.lifting_can_access(p_company_id, p_vessel_id), false)
    or (public.has_company_role(p_company_id, array['capitaine', 'marin'])
      and private.can_read_assigned_vessel(p_company_id, p_vessel_id));
$$;
revoke all on function private.can_read_lifting_vessel(bigint, bigint) from public, anon, authenticated;
grant execute on function private.can_read_lifting_vessel(bigint, bigint) to authenticated;

alter policy lifting_inventory_read on public.lifting_inventory using ((select private.can_read_lifting_vessel(company_id, vessel_id)));
alter policy lifting_inspections_read on public.lifting_inspections using ((select private.can_read_lifting_vessel(company_id, vessel_id)));
-- Child entry/certificate SELECT policies already check their parent via RLS.
create or replace function public.lifting_available_vessels()
returns setof public.vessels language sql stable security definer set search_path = '' as $$
  select vessel.* from public.vessels vessel where vessel.active and vessel.asset_kind in ('vessel', 'quay')
    and private.can_read_lifting_vessel(vessel.company_id, vessel.id) order by vessel.name;
$$;

-- Upload previously reused the path reader. Freeze its original scope before
-- broadening the reader so the grace window cannot authorize file mutations.
create function private.lifting_certificate_path_legacy_access(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and p_path ~ '^[0-9]+/[0-9]+/[0-9]+/([1-9][0-9]*/)?[0-9a-f-]+[.](pdf|jpg|png)$'
    and exists(select 1 from public.lifting_inventory item where item.id::text = split_part(p_path, '/', 3)
      and item.company_id::text = split_part(p_path, '/', 1) and item.vessel_id::text = split_part(p_path, '/', 2)
      and public.lifting_can_access(item.company_id, item.vessel_id));
$$;
revoke all on function private.lifting_certificate_path_legacy_access(text) from public, anon, authenticated;
create or replace function public.lifting_certificate_path_upload(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.lifting_certificate_path_legacy_access(p_path), false)
    and p_path ~ '^[0-9]+/[0-9]+/[0-9]+/[1-9][0-9]*/[0-9a-f-]+[.](pdf|jpg|png)$'
    and exists(select 1 from public.lifting_inventory item where item.id::text = split_part(p_path, '/', 3)
      and (split_part(p_path, '/', 4) = item.service_version::text
        or (split_part(p_path, '/', 4) = (item.service_version + 1)::text and public.has_any_role(array['admin', 'direction', 'armement']))));
$$;
create or replace function public.lifting_certificate_path_access(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and p_path ~ '^[0-9]+/[0-9]+/[0-9]+/([1-9][0-9]*/)?[0-9a-f-]+[.](pdf|jpg|png)$'
    and exists(select 1 from public.lifting_inventory item where item.id::text = split_part(p_path, '/', 3)
      and item.company_id::text = split_part(p_path, '/', 1) and item.vessel_id::text = split_part(p_path, '/', 2)
      and private.can_read_lifting_vessel(item.company_id, item.vessel_id));
$$;

alter policy lsa_items_read on public.lsa_items using (
  deleted_at is null and (select private.lsa_has_access()) and company_id = (select public.current_planning_company_id())
    and (public.planning_can_read_row(company_id, vessel_id, null, coalesce(issued_on, current_date), coalesce(expires_on, current_date))
      or public.lsa_can_add_item(vessel_id) or private.can_read_assigned_vessel(company_id, vessel_id))
);
create or replace function public.lsa_available_vessels()
returns setof public.vessels language sql stable security invoker set search_path = '' as $$
  select vessel.* from public.vessels vessel where vessel.asset_kind = 'vessel' and private.lsa_has_access()
    and vessel.company_id = public.current_planning_company_id()
    and ((vessel.active and (public.planning_can_read_row(vessel.company_id, vessel.id, null, current_date, current_date)
        or private.can_read_assigned_vessel(vessel.company_id, vessel.id)))
      or exists(select 1 from public.lsa_items item where item.vessel_id = vessel.id)) order by vessel.name;
$$;

alter policy fleet_certificates_company_read on public.fleet_certificates using (
  (select public.planning_can_read_row(company_id, vessel_id, null, coalesce(issued_on, current_date), coalesce(expires_on, current_date)))
    or (select private.can_read_assigned_vessel(company_id, vessel_id))
);

-- Keep the Marin author's history and temporary-captain exceptions. The extra
-- branch grants report consultation, without changing edit/submit/validate.
create or replace function public.dpr_can_read_report(target_dpr_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.dpr_reports report
    where report.id = target_dpr_id and report.deleted_at is null and public.dpr_user_has_module_access(report.company_id)
      and (not public.dpr_user_is_history_restricted_marin(report.company_id)
        or public.dpr_temporary_captain_for_report(report.id) or report.created_by = auth.uid()
        or private.can_read_assigned_vessel(report.company_id, report.vessel_id)));
$$;

-- Existing function ACLs are retained by CREATE OR REPLACE. Reinforce the newly
-- separated path helpers explicitly; Storage reads use path_access, writes use
-- path_upload, and neither changes the existing office-wide Storage policies.
revoke all on function public.lifting_certificate_path_access(text) from public, anon;
revoke all on function public.lifting_certificate_path_upload(text) from public, anon;
grant execute on function public.lifting_certificate_path_access(text) to authenticated;
grant execute on function public.lifting_certificate_path_upload(text) to authenticated;
notify pgrst, 'reload schema';
