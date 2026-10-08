-- Execute after project_billing_vessel_snapshots. Fixtures use actual authenticated
-- profiles and are rolled back, including vessel/catalogue rename operations.
begin;

do $$
declare
  company bigint := (select id from public.companies where code = 'bbtm');
  other_company bigint;
  project bigint;
  period bigint;
  vessel_a bigint;
  vessel_b bigint;
  foreign_vessel bigint;
  legacy_catalog bigint;
  catalog_a bigint;
  catalog_b bigint;
  raw_a bigint;
  raw_b bigint;
  legacy_raw bigint;
  office uuid := '8f000000-0000-0000-0000-000000000001';
  director uuid := '8f000000-0000-0000-0000-000000000002';
  sailor uuid := '8f000000-0000-0000-0000-000000000003';
  captain uuid := '8f000000-0000-0000-0000-000000000004';
  armement uuid := '8f000000-0000-0000-0000-000000000005';
  outsider uuid := '8f000000-0000-0000-0000-000000000006';
  actor uuid;
  denied boolean;
  affected integer;
begin
  if company is null then raise exception 'BBTM company fixture is required'; end if;
  insert into public.companies(code, name)
    values ('billing-vessels-fixture', 'Other billing vessel company') returning id into other_company;
  insert into public.vessels(company_id, name) values (company, 'BILLING VESSEL A') returning id into vessel_a;
  insert into public.vessels(company_id, name) values (company, 'BILLING VESSEL B') returning id into vessel_b;
  insert into public.vessels(company_id, name) values (other_company, 'FOREIGN BILLING VESSEL') returning id into foreign_vessel;
  insert into auth.users(id, email) values
    (office, 'billing-vessel-admin@example.invalid'), (director, 'billing-vessel-direction@example.invalid'),
    (sailor, 'billing-vessel-marin@example.invalid'), (captain, 'billing-vessel-capitaine@example.invalid'),
    (armement, 'billing-vessel-armement@example.invalid'), (outsider, 'billing-vessel-outsider@example.invalid');
  insert into public.profiles(id, email, display_name, active_company_id)
    select id, email, 'Billing vessel fixture', case when id = outsider then other_company else company end
    from auth.users where id in (office, director, sailor, captain, armement, outsider);
  insert into public.company_memberships(company_id, user_id, active) values
    (company, office, true), (company, director, true), (company, sailor, true),
    (company, captain, true), (company, armement, true), (other_company, outsider, true),
    (other_company, director, true)
    on conflict (company_id, user_id) do update set active = excluded.active;
  insert into public.user_roles(user_id, company_id, role_key) values
    (office, company, 'admin'), (director, company, 'direction'), (sailor, company, 'marin'),
    (captain, company, 'capitaine'), (armement, company, 'armement'), (outsider, other_company, 'admin');
  insert into public.projects(company_id, title, source_label)
    values (company, 'Billing vessel fixture project', 'seapilot') returning id into project;
  insert into public.project_billing_periods(company_id, project_id, period_month)
    values (company, project, '2026-10-01') returning id into period;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', office::text, true);
  execute 'set local role authenticated';
  insert into public.project_service_catalog(company_id, category, unit_amount_ht)
    values (company, 'Billing vessel mobilisation', 100) returning id into legacy_catalog;
  insert into public.project_service_catalog(company_id, category, unit_amount_ht, vessel_id, vessel_name)
    values (company, 'Billing vessel mobilisation', 200, vessel_a, 'BILLING VESSEL A') returning id into catalog_a;
  insert into public.project_service_catalog(company_id, category, unit_amount_ht, vessel_id, vessel_name)
    values (company, 'Billing vessel mobilisation', 300, vessel_b, 'BILLING VESSEL B') returning id into catalog_b;
  if not exists (select 1 from public.project_service_catalog where id = legacy_catalog and vessel_id is null and vessel_name = '') then
    raise exception 'legacy categories remain compatible without a vessel';
  end if;
  denied := false;
  begin
    insert into public.project_service_catalog(company_id, category, vessel_id, vessel_name)
      values (company, 'BILLING VESSEL MOBILISATION', vessel_a, 'BILLING VESSEL A');
  exception when unique_violation then denied := true;
  end;
  if not denied then raise exception 'duplicate active categories are rejected for the same vessel'; end if;
  denied := false;
  begin
    insert into public.project_service_catalog(company_id, category)
      values (company, 'BILLING VESSEL MOBILISATION');
  exception when unique_violation then denied := true;
  end;
  if not denied then raise exception 'legacy null-vessel categories retain their case-insensitive uniqueness'; end if;

  insert into public.project_billing_raw_lines(company_id, project_id, billing_period_id, service_date, designation, service_catalog_id, vessel_id, vessel_name, unit_amount_ht, quantity)
    values (company, project, period, '2026-10-08', 'Billing vessel mobilisation', catalog_a, vessel_a, 'BILLING VESSEL A', 200, 1.5) returning id into raw_a;
  insert into public.project_billing_raw_lines(company_id, project_id, billing_period_id, service_date, designation, vessel_id, vessel_name, unit_amount_ht)
    values (company, project, period, '2026-10-08', 'Manual vessel service', vessel_b, 'BILLING VESSEL B', 25) returning id into raw_b;
  insert into public.project_billing_raw_lines(company_id, project_id, billing_period_id, service_date, designation)
    values (company, project, period, '2026-10-08', 'Legacy vessel service') returning id into legacy_raw;
  if not exists (select 1 from public.project_billing_raw_lines where id = legacy_raw and vessel_id is null and vessel_name = '') then
    raise exception 'legacy raw lines remain compatible without a vessel';
  end if;

  denied := false;
  begin
    update public.project_service_catalog set vessel_id = foreign_vessel where id = catalog_a;
  exception when foreign_key_violation then denied := true;
  end;
  if not denied then raise exception 'catalogue cannot reference a vessel belonging to another company'; end if;
  denied := false;
  begin
    update public.project_billing_raw_lines set vessel_id = foreign_vessel where id = raw_a;
  exception when foreign_key_violation then denied := true;
  end;
  if not denied then raise exception 'raw line cannot reference a vessel belonging to another company'; end if;

  foreach actor in array array[office, director] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    update public.project_billing_raw_lines set vessel_id = vessel_b, vessel_name = 'BILLING VESSEL B' where id = raw_a;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'admin and direction can choose a vessel on a raw line'; end if;
    update public.project_service_catalog set vessel_name = 'Catalogue snapshot edited', unit_amount_ht = 999 where id = catalog_a;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'admin and direction can update a catalogue vessel snapshot'; end if;
  end loop;
  update public.project_billing_raw_lines set vessel_id = vessel_a, vessel_name = 'BILLING VESSEL A', unit_amount_ht = 200 where id = raw_a;
  execute 'reset role';
  update public.vessels set name = 'RENAMED BILLING VESSEL A' where id = vessel_a;
  perform set_config('request.jwt.claim.sub', office::text, true);
  execute 'set local role authenticated';
  if not exists (select 1 from public.project_billing_raw_lines where id = raw_a and vessel_id = vessel_a and vessel_name = 'BILLING VESSEL A' and unit_amount_ht = 200 and quantity = 1.5)
    or not exists (select 1 from public.project_billing_raw_lines where id = raw_b and vessel_id = vessel_b and vessel_name = 'BILLING VESSEL B' and unit_amount_ht = 25) then
    raise exception 'fleet and catalogue edits cannot rewrite raw snapshots or unrelated manual lines';
  end if;

  perform set_config('request.jwt.claim.sub', director::text, true);
  denied := false;
  begin
    insert into public.project_service_catalog(company_id, category, vessel_id, vessel_name)
      values (other_company, 'Direction in wrong company', foreign_vessel, 'FOREIGN BILLING VESSEL');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'a company manager role cannot grant writes in another company'; end if;

  foreach actor in array array[sailor, captain, armement] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    if not exists (select 1 from public.project_billing_raw_lines where id = raw_a and vessel_name = 'BILLING VESSEL A')
      or not exists (select 1 from public.project_service_catalog where id = catalog_a) then
      raise exception 'real Marin, Capitaine and Armement profiles can read company billing snapshots';
    end if;
    denied := false;
    begin
      insert into public.project_service_catalog(company_id, category, vessel_id, vessel_name)
        values (company, 'Denied role category', vessel_a, 'BILLING VESSEL A');
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'read-only profiles cannot create catalogue vessel entries'; end if;
    update public.project_service_catalog set vessel_id = vessel_b where id = catalog_a;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'read-only profiles cannot change catalogue vessels'; end if;
    update public.project_billing_raw_lines set vessel_id = vessel_b, vessel_name = 'CHANGED' where id = raw_a;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'read-only profiles cannot change raw vessel snapshots'; end if;
    delete from public.project_billing_raw_lines where id = raw_a;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'read-only profiles cannot delete raw vessel snapshots'; end if;
  end loop;

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  if exists (select 1 from public.project_service_catalog where id = catalog_a)
    or exists (select 1 from public.project_billing_raw_lines where id = raw_a) then
    raise exception 'another company cannot read BBTM billing vessel snapshots';
  end if;
  insert into public.project_service_catalog(company_id, category, vessel_id, vessel_name)
    values (other_company, 'Billing vessel mobilisation', foreign_vessel, 'FOREIGN BILLING VESSEL');
  execute 'set local role anon';
  denied := false;
  begin
    perform vessel_id, vessel_name from public.project_billing_raw_lines;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'anonymous access to vessel snapshots remains denied'; end if;

  execute 'reset role';
  denied := false;
  begin
    delete from public.vessels where id = vessel_a;
  exception when foreign_key_violation then denied := true;
  end;
  if not denied then raise exception 'vessels referenced by historical billing snapshots cannot be physically deleted'; end if;
end;
$$;

rollback;
