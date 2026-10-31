-- Execute after project_billing_service_quantity_modes. All fixtures and writes roll back.
begin;

do $$
declare
  company bigint;
  project bigint;
  period bigint;
  catalog bigint;
  legacy_catalog bigint;
  service bigint;
  legacy_service bigint;
  manager uuid := '92a00000-0000-0000-0000-000000000001';
  reader uuid := '92a00000-0000-0000-0000-000000000002';
  table_name text;
  assignment text;
  target bigint;
  denied boolean;
  affected integer;
begin
  insert into public.companies(code, name) values ('billing-quantity-fixture', 'Billing quantity fixture') returning id into company;
  insert into auth.users(id, email) values
    (manager, 'billing-quantity-manager@example.invalid'), (reader, 'billing-quantity-reader@example.invalid');
  insert into public.profiles(id, email, display_name, active_company_id)
    select id, email, 'Billing quantity fixture', company from auth.users where id in (manager, reader)
    on conflict(id) do update set active_company_id = excluded.active_company_id;
  insert into public.company_memberships(company_id, user_id, active) values (company, manager, true), (company, reader, true)
    on conflict(company_id, user_id) do update set active = true;
  insert into public.user_roles(user_id, company_id, role_key) values (manager, company, 'admin'), (reader, company, 'armement');
  insert into public.projects(company_id, title, source_label) values (company, 'Billing quantity fixture project', 'seapilot') returning id into project;
  insert into public.project_billing_periods(company_id, project_id, period_month) values (company, project, '2026-10-01') returning id into period;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', manager::text, true);
  execute 'set local role authenticated';

  -- Old clients can still create historical rows without knowing any new column.
  insert into public.project_service_catalog(company_id, category, unit_amount_ht)
    values (company, 'Quantity legacy fixture', 12) returning id into legacy_catalog;
  insert into public.project_billing_services(company_id, project_id, billing_period_id, service_catalog_id, category, unit_amount_ht, quantity)
    values (company, project, period, legacy_catalog, 'Quantity legacy fixture', 12, 2.5) returning id into legacy_service;
  if not exists(select 1 from public.project_service_catalog where id = legacy_catalog and quantity_mode is null
      and default_quantity is null and quantity_operation_types = '{}'::text[] and client_reference = '') then
    raise exception 'Legacy catalog defaults must remain nullable/unconfigured';
  end if;
  if not exists(select 1 from public.project_billing_services where id = legacy_service and quantity_mode is null and quantity = 2.5
      and unit_amount_ht = 12 and quantity_operation_types = '{}'::text[] and client_reference = '') then
    raise exception 'Legacy service quantities/prices must remain unchanged';
  end if;

  insert into public.project_service_catalog(company_id, category, unit_amount_ht, quantity_mode, quantity_operation_types, default_quantity, client_reference)
    values (company, 'Quantity configured fixture', 20, 'operations', array['24/24 Operation','24/24 Crew Change'], 0, 'CATALOG-PO') returning id into catalog;
  insert into public.project_billing_services(company_id, project_id, billing_period_id, service_catalog_id, category, unit_amount_ht, quantity,
      quantity_mode, quantity_operation_types, client_reference)
    values (company, project, period, catalog, 'Quantity configured fixture', 20, 0, 'manual', '{}'::text[], 'SERVICE-PO') returning id into service;
  update public.project_service_catalog set quantity_mode = 'month', default_quantity = 7, unit_amount_ht = 999, client_reference = 'CHANGED-CATALOG' where id = catalog;
  if not exists(select 1 from public.project_billing_services where id = service and quantity_mode = 'manual' and quantity = 0
      and unit_amount_ht = 20 and client_reference = 'SERVICE-PO' and quantity_operation_types = '{}'::text[]) then
    raise exception 'Catalog edits must not mutate saved billed-service snapshots';
  end if;

  -- Both tables accept all explicit modes, multi-type matching and a 200-character reference.
  foreach table_name in array array['project_service_catalog','project_billing_services'] loop
    target := case when table_name = 'project_service_catalog' then catalog else service end;
    foreach assignment in array array[
      'quantity_mode = ''period''', 'quantity_mode = ''month''', 'quantity_mode = ''manual''',
      'quantity_mode = ''operations'', quantity_operation_types = array[''24/24 Operation'',''24/24 Crew Change'']',
      'client_reference = repeat(''x'',200)'
    ] loop
      execute format('update public.%I set %s where id = $1', table_name, assignment) using target;
    end loop;
    foreach assignment in array array[
      'quantity_mode = ''unknown''',
      'quantity_mode = ''operations'', quantity_operation_types = ''{}''::text[]',
      'quantity_operation_types = array['' '']',
      'quantity_operation_types = array[null]::text[]',
      'quantity_operation_types = array[repeat(''x'',121)]',
      'client_reference = repeat(''x'',201)',
      'client_reference = '' leading-space'''
    ] loop
      denied := false;
      begin
        execute format('update public.%I set %s where id = $1', table_name, assignment) using target;
      exception when integrity_constraint_violation then denied := true;
      end;
      if not denied then raise exception 'Invalid configuration accepted on %: %', table_name, assignment; end if;
    end loop;
  end loop;

  denied := false;
  begin update public.project_service_catalog set default_quantity = -1 where id = catalog;
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'Negative catalog default quantity accepted'; end if;
  denied := false;
  begin update public.project_service_catalog set default_quantity = 'NaN'::numeric where id = catalog;
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'Nonfinite catalog default quantity accepted'; end if;
  denied := false;
  begin update public.project_billing_services set quantity = -1 where id = service;
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'Negative service quantity accepted'; end if;

  perform set_config('request.jwt.claim.sub', reader::text, true);
  update public.project_service_catalog set quantity_mode = 'manual' where id = catalog;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Non-manager can edit catalog quantity mode'; end if;
  update public.project_billing_services set client_reference = 'UNAUTHORIZED' where id = service;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Non-manager can edit service client reference'; end if;
  if not exists(select 1 from public.project_service_catalog where id = catalog) then raise exception 'Company readers lost catalog visibility'; end if;
  if has_function_privilege('anon', 'public.project_service_operation_types_valid(text[])', 'EXECUTE') then
    raise exception 'Anonymous users must not gain a new executable RPC';
  end if;
  execute 'reset role';
  raise notice 'Billing service quantity modes: legacy, defaults, snapshots, constraints and RLS checks passed';
end;
$$;

rollback;
