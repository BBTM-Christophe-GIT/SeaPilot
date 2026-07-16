-- Aggregate-only production reconciliation for Projects phase 6.
-- This file intentionally returns no names, contact details, URLs, or raw source payloads.

with checks as (
  select 'volume'::text as check_group, 'projects.total'::text as check_name,
         count(*)::bigint as observed, null::bigint as expected, 'info'::text as severity
  from public.projects
  union all
  select 'volume', 'projects.sharepoint', count(*) filter (where lower(trim(source_label)) = 'sharepoint'), null, 'critical'
  from public.projects
  union all
  select 'volume', 'clients.total', count(*), null, 'info' from public.clients
  union all
  select 'volume', 'clients.sharepoint', count(*) filter (where lower(trim(source_label)) = 'sharepoint'), null, 'critical'
  from public.clients
  union all
  select 'volume', 'vessels.total', count(*), null, 'info' from public.vessels
  union all
  select 'volume', 'project_documents.total', count(*), null, 'info' from public.project_documents
  union all
  select 'volume', 'contract_documents.total', count(*), null, 'info' from public.contract_documents
  union all
  select 'volume', 'planning_projects.total', count(*), null, 'info' from public.planning_projects

  union all
  select 'provenance', 'projects.sharepoint_identity_missing', count(*), 0, 'critical'
  from public.projects
  where lower(trim(source_label)) = 'sharepoint'
    and (nullif(trim(sharepoint_list_id), '') is null or nullif(trim(sharepoint_item_id), '') is null)
  union all
  select 'provenance', 'clients.sharepoint_identity_missing', count(*), 0, 'critical'
  from public.clients
  where lower(trim(source_label)) = 'sharepoint'
    and (nullif(trim(sharepoint_list_id), '') is null or nullif(trim(sharepoint_item_id), '') is null)
  union all
  select 'provenance', 'project_documents.drive_identity_missing', count(*), 0, 'critical'
  from public.project_documents
  where lower(trim(source_label)) = 'sharepoint'
    and (nullif(trim(sharepoint_drive_id), '') is null or nullif(trim(sharepoint_drive_item_id), '') is null)
  union all
  select 'provenance', 'contract_documents.drive_identity_missing', count(*), 0, 'critical'
  from public.contract_documents
  where lower(trim(source_label)) = 'sharepoint'
    and (nullif(trim(sharepoint_drive_id), '') is null or nullif(trim(sharepoint_drive_item_id), '') is null)
  union all
  select 'provenance', 'project_documents.unexpected_drive', count(*), 0, 'high'
  from public.project_documents
  where lower(trim(source_label)) = 'sharepoint'
    and sharepoint_drive_id is distinct from 'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_Ou31l1uVoWRrtjl4GcYGNl'
  union all
  select 'provenance', 'contract_documents.unexpected_drive', count(*), 0, 'high'
  from public.contract_documents
  where lower(trim(source_label)) = 'sharepoint'
    and sharepoint_drive_id is distinct from 'b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_OWUUcnVo9hTIk_y0nRfdyl'

  union all
  select 'integrity', 'projects.client_unresolved', count(*), 0, 'high'
  from public.projects
  where client_id is null
    and coalesce(nullif(trim(client_sharepoint_item_id), ''), nullif(trim(client_name), '')) is not null
  union all
  select 'integrity', 'projects.primary_vessel_unresolved', count(*), 0, 'high'
  from public.projects
  where primary_vessel_id is null
    and coalesce(nullif(trim(primary_vessel_sharepoint_item_id), ''), nullif(trim(primary_vessel_name), '')) is not null
  union all
  select 'integrity', 'projects.secondary_vessel_unresolved', count(*), 0, 'medium'
  from public.projects
  where secondary_vessel_id is null
    and coalesce(nullif(trim(secondary_vessel_sharepoint_item_id), ''), nullif(trim(secondary_vessel_name), '')) is not null
  union all
  select 'integrity', 'project_documents.project_unresolved', count(*), 0, 'high'
  from public.project_documents where project_id is null
  union all
  select 'integrity', 'contract_documents.project_unresolved', count(*), 0, 'high'
  from public.contract_documents where project_id is null
  union all
  select 'integrity', 'dpr_items.project_unresolved', count(*), 0, 'medium'
  from public.dpr_items
  where project_id is null
    and coalesce(nullif(trim(project_sharepoint_item_id), ''), nullif(trim(project_code), ''), nullif(trim(project_title), '')) is not null
  union all
  select 'integrity', 'purchase_requests.project_unresolved', count(*), 0, 'medium'
  from public.purchase_requests
  where project_id is null
    and coalesce(nullif(trim(project_sharepoint_item_id), ''), nullif(trim(project_code), ''), nullif(trim(project_title), '')) is not null
  union all
  select 'integrity', 'action_items.project_unresolved', count(*), 0, 'medium'
  from public.action_items
  where project_id is null
    and coalesce(nullif(trim(project_sharepoint_item_id), ''), nullif(trim(project_code), ''), nullif(trim(project_title), '')) is not null

  union all
  select 'validity', 'projects.critical_fields_missing', count(*), 0, 'critical'
  from public.projects
  where nullif(trim(title), '') is null or nullif(trim(project_code), '') is null
  union all
  select 'validity', 'projects.invalid_period', count(*), 0, 'high'
  from public.projects where starts_on is not null and ends_on is not null and ends_on < starts_on
  union all
  select 'validity', 'projects.same_vessel_twice', count(*), 0, 'high'
  from public.projects where primary_vessel_id is not null and primary_vessel_id = secondary_vessel_id
  union all
  select 'validity', 'clients.name_missing', count(*), 0, 'critical'
  from public.clients where nullif(trim(name), '') is null
  union all
  select 'validity', 'project_documents.folder_rows', count(*), 0, 'high'
  from public.project_documents where is_folder
  union all
  select 'validity', 'contract_documents.folder_rows', count(*), 0, 'high'
  from public.contract_documents where is_folder
  union all
  select 'validity', 'project_documents.invalid_url', count(*), 0, 'high'
  from public.project_documents
  where nullif(trim(file_url), '') is null
     or file_url !~* '^https://bbtm668[.]sharepoint[.]com/sites/QHSE(/|$)'
  union all
  select 'validity', 'contract_documents.invalid_url', count(*), 0, 'high'
  from public.contract_documents
  where nullif(trim(file_url), '') is null
     or file_url !~* '^https://bbtm668[.]sharepoint[.]com/sites/QHSE(/|$)'

  union all
  select 'uniqueness', 'projects.project_code_duplicates', count(*), 0, 'critical'
  from (
    select company_id, public.normalize_project_code(project_code)
    from public.projects
    group by company_id, public.normalize_project_code(project_code)
    having count(*) > 1
  ) duplicates
  union all
  select 'uniqueness', 'clients.active_name_duplicates', count(*), 0, 'high'
  from (
    select company_id, public.normalize_import_label(name)
    from public.clients
    where archived_at is null
    group by company_id, public.normalize_import_label(name)
    having count(*) > 1
  ) duplicates
  union all
  select 'uniqueness', 'project_documents.drive_item_duplicates', count(*), 0, 'critical'
  from (
    select sharepoint_drive_id, sharepoint_drive_item_id
    from public.project_documents
    where sharepoint_drive_id is not null and sharepoint_drive_item_id is not null
    group by sharepoint_drive_id, sharepoint_drive_item_id
    having count(*) > 1
  ) duplicates
  union all
  select 'uniqueness', 'contract_documents.drive_item_duplicates', count(*), 0, 'critical'
  from (
    select sharepoint_drive_id, sharepoint_drive_item_id
    from public.contract_documents
    where sharepoint_drive_id is not null and sharepoint_drive_item_id is not null
    group by sharepoint_drive_id, sharepoint_drive_item_id
    having count(*) > 1
  ) duplicates

  union all
  select 'numbering', 'counter_not_above_existing_codes', count(*), 0, 'critical'
  from public.project_number_counters counter
  where exists (
    select 1
    from public.projects project
    where project.company_id = counter.company_id
      and project.project_code ~ ('^' || counter.prefix || '[0-9]+$')
      and substring(project.project_code from char_length(counter.prefix) + 1)::integer >= counter.next_number
  )
)
select check_group, check_name, observed, expected, severity,
       case
         when expected is null then 'MEASURED'
         when observed = expected then 'PASS'
         else 'FAIL'
       end as result
from checks
order by
  case severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
  check_group,
  check_name;
