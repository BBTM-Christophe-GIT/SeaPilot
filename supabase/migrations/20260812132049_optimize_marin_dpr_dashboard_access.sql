-- Avoid evaluating dpr_can_read_report for every company DPR during dashboard loads.
-- Permissive policies preserve the existing role matrix while caching session
-- helpers as init plans and exposing an indexable author predicate for Marins.

drop policy if exists dpr_reports_company_read on public.dpr_reports;
drop policy if exists dpr_reports_office_read on public.dpr_reports;
drop policy if exists dpr_reports_marin_own_read on public.dpr_reports;
drop policy if exists dpr_reports_captain_read on public.dpr_reports;

create policy dpr_reports_office_read
on public.dpr_reports
for select
to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (select public.has_any_role(array['admin', 'direction', 'armement']))
);

create policy dpr_reports_marin_own_read
on public.dpr_reports
for select
to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and deleted_at is null
  and created_by = (select auth.uid())
  and (select public.has_role('marin'))
);

create policy dpr_reports_captain_read
on public.dpr_reports
for select
to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and deleted_at is null
  and (select public.has_role('capitaine'))
  and (
    validator_person_id = (select public.current_person_id())
    or public.dpr_captain_can_access_report(id)
  )
);

comment on policy dpr_reports_marin_own_read on public.dpr_reports is
  'Indexable author-scoped DPR read access for Marin profiles.';
