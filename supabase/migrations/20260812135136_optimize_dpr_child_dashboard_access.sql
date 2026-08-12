-- Avoid evaluating the security-definer dpr_can_read_report helper once per
-- child row during legacy dashboard loads. Role and tenant helpers become init
-- plans, while Marin ownership remains an indexed lookup on dpr_reports.

drop policy if exists dpr_daily_metrics_company_read on public.dpr_daily_metrics;
create policy dpr_daily_metrics_company_read
on public.dpr_daily_metrics
for select
to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (
    (select public.has_any_role(array['admin', 'direction', 'armement']))
    or (
      (select public.has_role('marin'))
      and exists (
        select 1
        from public.dpr_reports report
        where report.id = dpr_daily_metrics.dpr_id
          and report.deleted_at is null
          and report.created_by = (select auth.uid())
      )
    )
    or (
      (select public.has_role('capitaine'))
      and public.dpr_captain_can_access_report(dpr_id)
    )
  )
);

drop policy if exists dpr_incidents_company_read on public.dpr_incidents;
create policy dpr_incidents_company_read
on public.dpr_incidents
for select
to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (
    (select public.has_any_role(array['admin', 'direction', 'armement']))
    or (
      (select public.has_role('marin'))
      and exists (
        select 1
        from public.dpr_reports report
        where report.id = dpr_incidents.dpr_id
          and report.deleted_at is null
          and report.created_by = (select auth.uid())
      )
    )
    or (
      (select public.has_role('capitaine'))
      and public.dpr_captain_can_access_report(dpr_id)
    )
  )
);

drop policy if exists dpr_files_company_read on public.dpr_files;
create policy dpr_files_company_read
on public.dpr_files
for select
to authenticated
using (
  company_id = (select public.current_planning_company_id())
  and (
    (select public.has_any_role(array['admin', 'direction', 'armement']))
    or (
      (select public.has_role('capitaine'))
      and public.dpr_captain_can_access_report(dpr_id)
    )
    or (
      file_kind <> 'pdf'
      and (select public.has_role('marin'))
      and exists (
        select 1
        from public.dpr_reports report
        where report.id = dpr_files.dpr_id
          and report.deleted_at is null
          and report.created_by = (select auth.uid())
      )
    )
  )
);

comment on policy dpr_incidents_company_read on public.dpr_incidents is
  'Cached role checks with indexed Marin ownership; avoids per-incident report permission calls.';
