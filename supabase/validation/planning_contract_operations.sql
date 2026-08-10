-- Aggregate-only validation for Planning contract operations.
-- Run after the migration in the target environment. The output contains no
-- project titles, vessel names, financial values, or personal data.

select
  resolution_status,
  count(*) as occurrence_count
from public.planning_operation_project_reconciliation
group by resolution_status
order by resolution_status;

select
  count(*) filter (where catalog_project_id is not null) as linked_operations,
  count(*) filter (where catalog_project_id is null) as unlinked_events,
  count(*) filter (where vessel_count = 0) as operations_without_vessel,
  count(*) filter (where vessel_count > 2) as operations_with_more_than_two_vessels
from (
  select
    occurrence.id,
    occurrence.catalog_project_id,
    count(link.vessel_id) as vessel_count
  from public.planning_projects occurrence
  left join public.planning_operation_vessels link
    on link.planning_occurrence_id = occurrence.id
  group by occurrence.id, occurrence.catalog_project_id
) validated;

select
  has_column_privilege('authenticated', 'public.planning_projects', 'charter_hire', 'select')
    as authenticated_can_select_operation_hire,
  has_column_privilege('authenticated', 'public.planning_projects', 'hire_currency', 'select')
    as authenticated_can_select_operation_hire_currency,
  has_column_privilege('authenticated', 'public.planning_projects', 'hire_unit', 'select')
    as authenticated_can_select_operation_hire_unit,
  has_column_privilege('authenticated', 'public.planning_projects', 'title', 'select')
    as authenticated_can_select_operation_title;
