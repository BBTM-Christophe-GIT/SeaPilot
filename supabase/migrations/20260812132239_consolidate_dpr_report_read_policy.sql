-- Keep the optimized role predicates in one policy so PostgreSQL evaluates only
-- one permissive SELECT policy for each report.

drop policy if exists dpr_reports_office_read on public.dpr_reports;
drop policy if exists dpr_reports_marin_own_read on public.dpr_reports;
drop policy if exists dpr_reports_captain_read on public.dpr_reports;
drop policy if exists dpr_reports_role_read on public.dpr_reports;

create policy dpr_reports_role_read
on public.dpr_reports
for select
to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (
    (select public.has_any_role(array['admin', 'direction', 'armement']))
    or (
      deleted_at is null
      and created_by = (select auth.uid())
      and (select public.has_role('marin'))
    )
    or (
      deleted_at is null
      and (select public.has_role('capitaine'))
      and (
        validator_person_id = (select public.current_person_id())
        or public.dpr_captain_can_access_report(id)
      )
    )
  )
);

comment on policy dpr_reports_role_read on public.dpr_reports is
  'Cached, role-scoped DPR access for office, Marin author and Capitaine profiles.';
