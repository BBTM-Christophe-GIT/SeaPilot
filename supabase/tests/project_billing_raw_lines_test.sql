-- Run with real authenticated role fixtures. All fixtures and writes are rolled back.
begin;

do $$
declare
  company bigint := (select id from public.companies where code = 'bbtm');
  other_company bigint;
  project bigint;
  other_project bigint;
  sibling_project bigint;
  period bigint;
  other_period bigint;
  sibling_period bigint;
  catalog bigint;
  other_catalog bigint;
  manual_line bigint;
  catalog_line bigint;
  default_line bigint;
  actor uuid;
  office uuid := '8e000000-0000-0000-0000-000000000001';
  director uuid := '8e000000-0000-0000-0000-000000000002';
  sailor uuid := '8e000000-0000-0000-0000-000000000003';
  captain uuid := '8e000000-0000-0000-0000-000000000004';
  armement uuid := '8e000000-0000-0000-0000-000000000005';
  outsider uuid := '8e000000-0000-0000-0000-000000000006';
  denied boolean;
  affected integer;
begin
  if company is null then raise exception 'BBTM company fixture is required'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.project_billing_raw_lines'::regclass)
    or not has_table_privilege('authenticated', 'public.project_billing_raw_lines', 'SELECT, INSERT, UPDATE, DELETE')
    or has_table_privilege('anon', 'public.project_billing_raw_lines', 'SELECT, INSERT, UPDATE, DELETE')
    or has_sequence_privilege('anon', 'public.project_billing_raw_lines_id_seq', 'USAGE') then
    raise exception 'raw billing grants and RLS must match authenticated company billing access';
  end if;

  insert into public.companies(code, name)
    values ('raw-billing-fixture', 'Raw billing other company') returning id into other_company;
  insert into auth.users(id, email) values
    (office, 'raw-billing-admin@example.invalid'),
    (director, 'raw-billing-direction@example.invalid'),
    (sailor, 'raw-billing-marin@example.invalid'),
    (captain, 'raw-billing-capitaine@example.invalid'),
    (armement, 'raw-billing-armement@example.invalid'),
    (outsider, 'raw-billing-other-company@example.invalid');
  insert into public.profiles(id, email, display_name, active_company_id)
    select id, email, 'Raw billing fixture', case when id = outsider then other_company else company end
    from auth.users where id in (office, director, sailor, captain, armement, outsider);
  insert into public.company_memberships(company_id, user_id, active) values
    (company, office, true), (company, director, true), (company, sailor, true),
    (company, captain, true), (company, armement, true), (other_company, outsider, true),
    (other_company, director, true)
    on conflict (company_id, user_id) do update set active = excluded.active;
  insert into public.user_roles(user_id, company_id, role_key) values
    (office, company, 'admin'), (director, company, 'direction'),
    (sailor, company, 'marin'), (captain, company, 'capitaine'),
    (armement, company, 'armement'), (outsider, other_company, 'admin');
  insert into public.projects(company_id, title, source_label)
    values (company, 'Raw billing fixture project', 'seapilot') returning id into project;
  insert into public.projects(company_id, title, source_label)
    values (company, 'Raw billing sibling project', 'seapilot') returning id into sibling_project;
  insert into public.projects(company_id, title, source_label)
    values (other_company, 'Raw billing other project', 'seapilot') returning id into other_project;
  insert into public.project_billing_periods(company_id, project_id, period_month)
    values (company, project, '2026-10-01') returning id into period;
  insert into public.project_billing_periods(company_id, project_id, period_month)
    values (company, sibling_project, '2026-10-01') returning id into sibling_period;
  insert into public.project_billing_periods(company_id, project_id, period_month)
    values (other_company, other_project, '2026-10-01') returning id into other_period;
  insert into public.project_service_catalog(company_id, category, unit_amount_ht)
    values (company, 'Raw billing mobilisation', 450) returning id into catalog;
  insert into public.project_service_catalog(company_id, category, unit_amount_ht)
    values (other_company, 'Raw billing other mobilisation', 800) returning id into other_catalog;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', office::text, true);
  execute 'set local role authenticated';
  if not (select include_raw_in_pdf from public.project_billing_periods where id = period) then
    raise exception 'new monthly periods must include raw lines by default';
  end if;
  insert into public.project_billing_raw_lines(company_id, project_id, billing_period_id, service_date, designation, unit_amount_ht, quantity)
    values (company, project, period, '2026-10-08', 'Raw billing mobilisation', 17.25, 2.5)
    returning id into manual_line;
  insert into public.project_billing_raw_lines(company_id, project_id, billing_period_id, service_date, designation, unit_amount_ht, quantity, service_catalog_id)
    values (company, project, period, '2026-10-08', 'Raw billing mobilisation', 450, 2, catalog)
    returning id into catalog_line;
  insert into public.project_billing_raw_lines(company_id, project_id, billing_period_id, service_date, designation, unit_amount_ht)
    values (company, project, period, '2026-10-09', 'Raw billing manual default', 10.19)
    returning id into default_line;
  if (select count(*) from public.project_billing_raw_lines where billing_period_id = period and designation = 'Raw billing mobilisation') <> 2
    or not exists (select 1 from public.project_billing_raw_lines where id = manual_line and service_catalog_id is null and unit_amount_ht = 17.25 and quantity = 2.5)
    or not exists (select 1 from public.project_billing_raw_lines where id = default_line and quantity = 1 and include_in_pdf and created_by = office) then
    raise exception 'duplicate designations and manual values must survive without catalogue lookup; quantity defaults to one';
  end if;
  update public.project_service_catalog set unit_amount_ht = 999 where id = catalog;
  update public.project_billing_raw_lines set unit_amount_ht = 10.19, quantity = 1.125 where id = catalog_line;
  if not exists (select 1 from public.project_billing_raw_lines where id = manual_line and unit_amount_ht = 17.25)
    or not exists (select 1 from public.project_billing_raw_lines where id = catalog_line and unit_amount_ht = 10.19 and quantity = 1.125 and round(unit_amount_ht * quantity, 2) = 11.46) then
    raise exception 'catalogue changes must not replace line snapshots or user edited amounts';
  end if;
  update public.project_billing_raw_lines set include_in_pdf = false where id = manual_line;
  update public.project_billing_periods set include_raw_in_pdf = false where id = period;
  if (select include_in_pdf from public.project_billing_raw_lines where id = manual_line)
    or (select include_raw_in_pdf from public.project_billing_periods where id = period) then
    raise exception 'manager can exclude a line and the entire raw section independently';
  end if;
  update public.project_billing_periods set include_raw_in_pdf = true where id = period;

  denied := false;
  begin
    insert into public.project_billing_raw_lines(company_id, project_id, billing_period_id, service_date, designation)
      values (company, sibling_project, period, '2026-10-08', 'Wrong project');
  exception when foreign_key_violation then denied := true;
  end;
  if not denied then raise exception 'a line cannot reuse another project billing period'; end if;
  denied := false;
  begin
    insert into public.project_billing_raw_lines(company_id, project_id, billing_period_id, service_date, designation)
      values (company, project, other_period, '2026-10-08', 'Wrong company period');
  exception when foreign_key_violation then denied := true;
  end;
  if not denied then raise exception 'a line cannot reuse another company billing period'; end if;
  denied := false;
  begin
    update public.project_billing_raw_lines set service_catalog_id = other_catalog where id = manual_line;
  exception when foreign_key_violation then denied := true;
  end;
  if not denied then raise exception 'a line cannot reference another company catalogue'; end if;

  foreach actor in array array[office, director] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    insert into public.project_billing_raw_lines(company_id, project_id, billing_period_id, service_date, designation, unit_amount_ht)
      values (company, project, period, '2026-10-08', 'Manager CRUD', 35);
    update public.project_billing_raw_lines set quantity = 2 where billing_period_id = period and designation = 'Manager CRUD';
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'manager can update raw billing lines'; end if;
    delete from public.project_billing_raw_lines where billing_period_id = period and designation = 'Manager CRUD';
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'manager can delete raw billing lines'; end if;
  end loop;

  -- Direction in BBTM has only membership in the other company, not a manager role there.
  denied := false;
  begin
    insert into public.project_billing_raw_lines(company_id, project_id, billing_period_id, service_date, designation)
      values (other_company, other_project, other_period, '2026-10-08', 'Manager in wrong company');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'manager role in one company cannot grant writes in another'; end if;

  foreach actor in array array[sailor, captain, armement] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    if (select count(*) from public.project_billing_raw_lines where billing_period_id = period) <> 3 then
      raise exception 'actual company Marin, Capitaine and Armement fixtures read billing lines';
    end if;
    denied := false;
    begin
      insert into public.project_billing_raw_lines(company_id, project_id, billing_period_id, service_date, designation)
        values (company, project, period, '2026-10-08', 'Non manager insert');
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'non manager cannot insert raw billing lines'; end if;
    update public.project_billing_raw_lines set unit_amount_ht = 99999 where id = manual_line;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'non manager cannot update raw billing lines'; end if;
    delete from public.project_billing_raw_lines where id = manual_line;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'non manager cannot delete raw billing lines'; end if;
    update public.project_billing_periods set include_raw_in_pdf = false where id = period;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'non manager cannot change raw section inclusion'; end if;
  end loop;

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  if exists (select 1 from public.project_billing_raw_lines where billing_period_id = period) then
    raise exception 'other company manager cannot read BBTM lines';
  end if;
  denied := false;
  begin
    insert into public.project_billing_raw_lines(company_id, project_id, billing_period_id, service_date, designation)
      values (company, project, period, '2026-10-08', 'Other company insert');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'other company manager cannot insert BBTM lines'; end if;
  update public.project_billing_raw_lines set company_id = other_company where id = manual_line;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'other company manager cannot update BBTM lines'; end if;
  delete from public.project_billing_raw_lines where id = manual_line;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'other company manager cannot delete BBTM lines'; end if;

  execute 'set local role anon';
  perform set_config('request.jwt.claim.sub', '', true);
  denied := false;
  begin
    perform 1 from public.project_billing_raw_lines;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'anonymous reads must be denied'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', office::text, true);
  execute 'set local role authenticated';
  denied := false;
  begin
    update public.project_billing_raw_lines set unit_amount_ht = -1 where id = manual_line;
  exception when check_violation then denied := true;
  end;
  if not denied then raise exception 'negative unit amounts must be rejected'; end if;
  denied := false;
  begin
    update public.project_billing_raw_lines set quantity = -1 where id = manual_line;
  exception when check_violation then denied := true;
  end;
  if not denied then raise exception 'negative quantities must be rejected'; end if;
  denied := false;
  begin
    update public.project_billing_raw_lines set quantity = 'NaN'::numeric where id = manual_line;
  exception when check_violation then denied := true;
  end;
  if not denied then raise exception 'non finite quantities must be rejected'; end if;
  denied := false;
  begin
    update public.project_billing_raw_lines set designation = ' ' where id = manual_line;
  exception when check_violation then denied := true;
  end;
  if not denied then raise exception 'blank designations must be rejected'; end if;
  denied := false;
  begin
    update public.project_billing_raw_lines set service_date = null where id = manual_line;
  exception when not_null_violation then denied := true;
  end;
  if not denied then raise exception 'service date is required'; end if;
  perform public.projects_save_billing_reference(project, 7, 'OLD-SECTIONS');
  perform public.projects_save_billing_reference(project, 15, 'WITH-RAW');
  if not exists (select 1 from public.project_billing_client_references where project_id = project and scope = 7 and reference = 'OLD-SECTIONS')
    or not exists (select 1 from public.project_billing_client_references where project_id = project and scope = 15 and reference = 'WITH-RAW') then
    raise exception 'scope 15 references must coexist with original scope 7';
  end if;
  denied := false;
  begin
    perform public.projects_save_billing_reference(project, 16, 'INVALID');
  exception when invalid_parameter_value then denied := true;
  end;
  if not denied then raise exception 'unknown PDF scope bits must be rejected'; end if;

  insert into public.project_billing_raw_lines(company_id, project_id, billing_period_id, service_date, designation)
    select company, project, period, '2026-10-08'::date, 'Unlimited rows' from generate_series(1, 1005);
  if (select count(*) from public.project_billing_raw_lines where billing_period_id = period) <> 1008 then
    raise exception 'billing periods must allow more than 1000 raw lines and repeated designations';
  end if;

  execute 'reset role';
  delete from public.project_billing_periods where id = period;
  if exists (select 1 from public.project_billing_raw_lines where billing_period_id = period) then
    raise exception 'deleting a monthly period cascades to its raw lines';
  end if;
  insert into public.project_billing_raw_lines(company_id, project_id, billing_period_id, service_date, designation)
    values (company, sibling_project, sibling_period, '2026-10-08', 'Cascade project');
  -- Project creation also creates a contract; remove only that fixture prerequisite.
  delete from public.project_contracts where project_id = sibling_project;
  delete from public.projects where id = sibling_project;
  if exists (select 1 from public.project_billing_raw_lines where billing_period_id = sibling_period) then
    raise exception 'deleting a project cascades through its periods to raw lines';
  end if;
end;
$$;

rollback;
