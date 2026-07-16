-- Aggregate-only security and architecture checks for Projects phase 6.
-- Results contain no identities, project data, document names, URLs or source payloads.

with target_tables(table_name) as (
  values
    ('clients'::text),
    ('projects'),
    ('project_contracts'),
    ('project_documents'),
    ('contract_documents'),
    ('project_change_log')
), target_rpcs(function_name) as (
  values
    ('clients_save'::text),
    ('projects_save'),
    ('projects_create'),
    ('projects_archive'),
    ('projects_set_number_floor'),
    ('projects_set_supplytime'),
    ('projects_catalog_options'),
    ('resolve_sharepoint_project_links'),
    ('resolve_sharepoint_project_document_links'),
    ('resolve_sharepoint_dpr_links'),
    ('resolve_sharepoint_operation_links')
), checks as (
  select
    'rls'::text as check_group,
    'target_tables_without_rls'::text as check_name,
    count(*)::bigint as observed,
    0::bigint as expected,
    'critical'::text as severity
  from target_tables target
  left join pg_catalog.pg_class relation
    on relation.relname = target.table_name
   and relation.relnamespace = 'public'::regnamespace
  where relation.oid is null or not relation.relrowsecurity

  union all
  select 'rls', 'catalog_policies_exposing_unvalidated_roles', count(*), 0, 'critical'
  from pg_catalog.pg_policies policy
  where policy.schemaname = 'public'
    and policy.tablename in (
      'clients', 'projects', 'project_contracts',
      'project_documents', 'contract_documents', 'project_change_log'
    )
    and concat_ws(' ', policy.qual, policy.with_check) ~* '(armement|capitaine|marin)'

  union all
  select 'privileges', 'anon_table_privileges', count(*), 0, 'critical'
  from information_schema.role_table_grants grant_row
  join target_tables target on target.table_name = grant_row.table_name
  where grant_row.table_schema = 'public' and grant_row.grantee = 'anon'

  union all
  select 'privileges', 'authenticated_delete_privileges', count(*), 0, 'critical'
  from information_schema.role_table_grants grant_row
  join target_tables target on target.table_name = grant_row.table_name
  where grant_row.table_schema = 'public'
    and grant_row.grantee = 'authenticated'
    and grant_row.privilege_type = 'DELETE'

  union all
  select 'privileges', 'authenticated_core_write_bypass', count(*), 0, 'critical'
  from information_schema.role_table_grants grant_row
  where grant_row.table_schema = 'public'
    and grant_row.table_name in ('clients', 'projects', 'project_contracts')
    and grant_row.grantee = 'authenticated'
    and grant_row.privilege_type in ('INSERT', 'UPDATE')

  union all
  select 'privileges', 'public_rpc_execute', count(distinct procedure.oid), 0, 'critical'
  from pg_catalog.pg_proc procedure
  join target_rpcs target on target.function_name = procedure.proname
  where procedure.pronamespace = 'public'::regnamespace
    and has_function_privilege('public', procedure.oid, 'EXECUTE')

  union all
  select 'privileges', 'anon_rpc_execute', count(distinct procedure.oid), 0, 'critical'
  from pg_catalog.pg_proc procedure
  join target_rpcs target on target.function_name = procedure.proname
  where procedure.pronamespace = 'public'::regnamespace
    and has_function_privilege('anon', procedure.oid, 'EXECUTE')

  union all
  select 'functions', 'security_definer_without_search_path', count(*), 0, 'critical'
  from pg_catalog.pg_proc procedure
  join target_rpcs target on target.function_name = procedure.proname
  where procedure.pronamespace = 'public'::regnamespace
    and procedure.prosecdef
    and not coalesce(procedure.proconfig, '{}'::text[])::text[] && array['search_path=public, pg_temp']

  union all
  select 'architecture', 'binary_columns_in_project_domain', count(*), 0, 'critical'
  from information_schema.columns column_row
  join target_tables target on target.table_name = column_row.table_name
  where column_row.table_schema = 'public' and column_row.data_type = 'bytea'

  union all
  select 'architecture', 'project_specific_storage_buckets', count(*), 0, 'critical'
  from storage.buckets bucket
  where bucket.id ~* '(project|projet|contract|contrat|sharepoint)'
     or bucket.name ~* '(project|projet|contract|contrat|sharepoint)'

  union all
  select 'architecture', 'planning_catalog_link_columns', count(*), 0, 'high'
  from information_schema.columns column_row
  where column_row.table_schema = 'public'
    and column_row.table_name = 'planning_projects'
    and column_row.column_name in ('catalog_project_id', 'project_id')
)
select
  check_group,
  check_name,
  observed,
  expected,
  severity,
  case when observed = expected then 'PASS' else 'FAIL' end as result
from checks
order by
  case severity when 'critical' then 1 when 'high' then 2 else 3 end,
  check_group,
  check_name;
