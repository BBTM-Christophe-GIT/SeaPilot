-- Run only after applying the v4 migration and reviewing the eligible count.
-- Scope: BBTM, September/October 2026, complete cached calculations, and only
-- draft/unsubmitted days. No intervals, approvals, signatures or snapshots change.
begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';

create temporary table working_time_v4_open_calculation_ids on commit drop as
select calculation.id
from public.working_time_calculation_windows calculation
join public.companies company on company.id = calculation.company_id
cross join lateral (
  select work_interval.local_work_date
  from public.working_time_intervals work_interval
  where work_interval.company_id = calculation.company_id
    and work_interval.person_id = calculation.person_id
    and work_interval.voided_at is null
    and work_interval.starts_at < calculation.window_end
    and work_interval.ends_at > calculation.window_end - interval '7 days'
  order by work_interval.ends_at desc, work_interval.id desc
  limit 1
) contributing_day
where company.code = 'bbtm'
  and calculation.local_window_end_date between date '2026-09-01' and date '2026-10-31'
  and calculation.calculation_version < 4
  and calculation.work_rest_policy_id is not null
  and calculation.work_24h_compliant is not null
  and calculation.rest_24h_compliant is not null
  and calculation.consecutive_rest_compliant is not null
  and calculation.rest_period_count_compliant is not null
  and calculation.work_7d_compliant is not null
  and calculation.rest_7d_compliant is not null
  and not exists (
    select 1 from public.working_time_day_approvals approval
    where approval.company_id = calculation.company_id
      and approval.person_id = calculation.person_id
      and approval.local_work_date in (calculation.local_window_end_date, contributing_day.local_work_date)
      and approval.status <> 'draft'
  );

select count(*) as eligible_calculations
from working_time_v4_open_calculation_ids;

-- Preserve calculation IDs and notification fingerprints. The before-row v4
-- rule trigger stays enabled; the notification trigger is restored atomically.
alter table public.working_time_calculation_windows
  disable trigger working_time_calculation_non_compliance_notify;
with updated as (
  update public.working_time_calculation_windows calculation
  set calculated_at = now()
  from working_time_v4_open_calculation_ids eligible
  where calculation.id = eligible.id
  returning calculation.id, calculation.calculation_version
)
select count(*) as recalculated, min(calculation_version) as minimum_version,
  max(calculation_version) as maximum_version from updated;
alter table public.working_time_calculation_windows
  enable trigger working_time_calculation_non_compliance_notify;
commit;
