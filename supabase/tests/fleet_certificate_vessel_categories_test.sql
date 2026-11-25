-- The office and onboard checks use real authenticated profiles and RLS.
begin;

do $test$
declare
  company bigint;
  foreign_company bigint;
  river bigint;
  maritime bigint;
  river_by_label bigint;
  inactive bigint;
  office bigint;
  yard bigint;
  foreign_vessel bigint;
  employee bigint;
  certificate bigint;
  parent_category bigint;
  child_category bigint;
  actor uuid;
  profile_role text;
  manager_category bigint;
  inspection bigint;
  inspection_entry bigint;
  inspection_revision integer;
  report_path text;
  lifting_certificate bigint;
begin
  select id into strict company from public.companies where code = 'bbtm';
  insert into public.companies (code, name)
    values ('certificate-category-test', 'Certificate fixture company') returning id into foreign_company;
  insert into public.fleet_certificate_categories (company_id, vessel_type, category_key, category_label)
    values (foreign_company, 'maritime', 'test-foreign-category', 'Certificate fixture foreign category');

  insert into public.vessels (company_id, name, acronym, active, navigation_category, length_overall)
    values (company, 'L''ILE DE FRANCE CERTIFICATE FIXTURE', 'IDF-CERT', true, 'FLUVIAL', '21,5 m')
    returning id into river;
  insert into public.vessels (company_id, name, acronym, active)
    values (company, 'CERTIFICATE FIXTURE MARITIME', 'CFM', true) returning id into maritime;
  insert into public.vessels (company_id, name, acronym, active, type_label)
    values (company, 'CERTIFICATE FIXTURE FLUVIAL', 'CFF', true, 'Remorqueur fluvial')
    returning id into river_by_label;
  insert into public.vessels (company_id, name, acronym, active)
    values (company, 'CERTIFICATE FIXTURE INACTIVE', 'CFI', false) returning id into inactive;
  insert into public.vessels (company_id, name, acronym, active, asset_kind)
    values (company, 'CERTIFICATE FIXTURE OFFICE', 'CFO', true, 'office') returning id into office;
  insert into public.vessels (company_id, name, acronym, active, asset_kind)
    values (company, 'CERTIFICATE FIXTURE YARD', 'CFY', true, 'quay') returning id into yard;
  insert into public.fleet_certificates (company_id, vessel_id, category_key, category_label, title)
    values (company, yard, '04-assurance', '04 - Assurance', 'Existing yard certificate');
  insert into public.vessels (company_id, name, acronym, active)
    values (foreign_company, 'CERTIFICATE FIXTURE FOREIGN', 'CFX', true) returning id into foreign_vessel;

  assert not has_table_privilege('anon', 'public.fleet_certificate_categories', 'SELECT'),
    'Anonymous catalog access';
  assert not has_function_privilege('anon', 'public.list_fleet_certificate_vessels()', 'EXECUTE'),
    'Anonymous vessel picker';
  assert not has_table_privilege('authenticated', 'public.fleet_certificate_categories', 'DELETE'),
    'Physical category deletion';
  assert not has_column_privilege('authenticated', 'public.fleet_certificate_categories', 'vessel_type', 'UPDATE'),
    'Category type is mutable';
  assert not exists (select 1 from public.fleet_certificates where vessel_id = river),
    'Expected a new river vessel without documents';

  foreach profile_role in array array['admin', 'direction', 'armement', 'capitaine', 'marin'] loop
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '{}', true);
    actor := gen_random_uuid();
    insert into auth.users (id, email) values (actor, actor::text || '@example.invalid');
    insert into public.profiles (id, email, display_name, active_company_id)
      values (actor, actor::text || '@example.invalid', 'Certificate fixture ' || profile_role, company);
    insert into public.company_memberships (company_id, user_id, active)
      values (company, actor, true) on conflict (company_id, user_id) do update set active = true;
    insert into public.user_roles (user_id, company_id, role_key) values (actor, company, profile_role);

    if profile_role in ('capitaine', 'marin') then
      insert into public.people (company_id, user_id, first_name, last_name, function_label, sailor_number, active)
        values (company, actor, 'Fixture', 'Certificate', profile_role, actor::text, true)
        returning id into employee;
      insert into public.planning_assignments (company_id, vessel_id, crew_person_id, starts_on, ends_on, assignment_role, confirmation_status)
        values (company, river, employee, current_date - 1, current_date + 1, profile_role, 'confirmed');
    end if;

    perform set_config('request.jwt.claim.sub', actor::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    assert not exists (select 1 from public.fleet_certificate_categories where company_id = foreign_company),
      'Foreign company catalog visible to ' || profile_role;
    assert not exists (
      select 1 from public.list_fleet_certificate_vessels() where id in (inactive, office, foreign_vessel)
    ), 'Picker includes an inactive or out-of-scope asset';

    if profile_role in ('capitaine', 'marin') then
      assert not exists (select 1 from public.list_fleet_certificate_vessels()),
        'Onboard profile can open management picker';
      assert exists (select 1 from public.fleet_certificates where id = certificate),
        'Onboard profile cannot read the assigned vessel certificate';
      assert exists (select 1 from public.fleet_certificate_categories where id = child_category),
        'Onboard profile cannot read the assigned certificate category';
      update public.fleet_certificate_categories set category_label = 'Unauthorized edit' where id = child_category;
      assert not found, 'Onboard profile edited the category';
      begin
        insert into public.fleet_certificate_categories (company_id, vessel_type, category_key, category_label)
          values (company, 'fluvial', 'test-crew-category', 'Unauthorized category');
        raise exception 'Onboard profile created a category';
      exception when insufficient_privilege then null;
      end;
      begin
        perform public.create_fleet_certificate_line(river, 'test-river-child', 'Fixture', 'Unauthorized line');
        raise exception 'Onboard profile created a certificate';
      exception when insufficient_privilege then null;
      end;
    else
      assert exists (
        select 1 from public.list_fleet_certificate_vessels()
        where id = river and company_id = company and vessel_type = 'fluvial' and overall_length_m = '21,5 m'
      ), 'Empty river vessel absent from picker for ' || profile_role;
      assert exists (
        select 1 from public.list_fleet_certificate_vessels() where id = maritime and vessel_type = 'maritime'
      ), 'Vessel without type is not maritime';
      assert exists (
        select 1 from public.list_fleet_certificate_vessels() where id = river_by_label and vessel_type = 'fluvial'
      ), 'Type label fallback does not classify river vessels';
      assert exists (
        select 1 from public.list_fleet_certificate_vessels()
        where id = yard and asset_kind = 'quay' and vessel_type = 'maritime'
      ), 'Existing yard disappeared from the picker';
      insert into public.fleet_certificate_categories (company_id, vessel_type, category_key, category_label)
        values (company, 'maritime', 'test-manager-' || profile_role, 'Fixture ' || profile_role)
        returning id into manager_category;
      update public.fleet_certificate_categories set category_label = 'Renamed ' || profile_role
        where id = manager_category;
      assert found, profile_role || ' could not rename a category';
      perform public.create_fleet_certificate_line(
        maritime, 'test-manager-' || profile_role, 'Fixture ' || profile_role, 'Maritime certificate'
      );
    end if;

    if profile_role = 'admin' then
      assert exists (
        select 1 from public.fleet_certificate_categories
        where company_id = company and vessel_type = 'fluvial' and category_key = 'fluvial-certificats-navigation'
      ), 'River seed is missing';
      assert exists (
        select 1 from public.fleet_certificate_categories
        where company_id = company and vessel_type = 'maritime' and category_key = '06-1-extincteurs-portatifs'
          and parent_key = '06-incendie'
      ), 'Legacy maritime hierarchy is missing';
      begin
        insert into public.fleet_certificate_categories (company_id, vessel_type, category_key, category_label)
          values (foreign_company, 'fluvial', 'test-wrong-company', 'Out of company');
        raise exception 'Cross-company catalog write allowed';
      exception when insufficient_privilege then null;
      end;

      insert into public.fleet_certificate_categories (company_id, vessel_type, category_key, category_label)
        values (company, 'fluvial', 'test-river-parent', 'Fixture fluviale') returning id into parent_category;
      insert into public.fleet_certificate_categories (company_id, vessel_type, category_key, category_label, parent_key)
        values (company, 'fluvial', 'test-river-child', '  Contrôle de la fixture  ', 'test-river-parent')
        returning id into child_category;
      assert (select category_label = 'Contrôle de la fixture' from public.fleet_certificate_categories where id = child_category),
        'Category label was not trimmed';

      begin
        update public.fleet_certificate_categories set is_active = false where id = parent_category;
        raise exception 'Parent with active child archived';
      exception when check_violation then null;
      end;
      begin
        insert into public.fleet_certificate_categories (company_id, vessel_type, category_key, category_label, parent_key)
          values (company, 'maritime', 'test-wrong-parent', 'Cross-type parent', 'test-river-parent');
        raise exception 'Cross-type hierarchy allowed';
      exception when check_violation then null;
      end;
      begin
        insert into public.fleet_certificate_categories (company_id, vessel_type, category_key, category_label, parent_key)
          values (company, 'fluvial', 'test-grandchild', 'Cross-level parent', 'test-river-child');
        raise exception 'Third category level allowed';
      exception when check_violation then null;
      end;

      certificate := public.create_fleet_certificate_line(river, 'test-river-child', 'Untrusted label', 'River certificate fixture');
      perform public.create_fleet_certificate_line(yard, '04-assurance', '04 - Assurance', 'New yard certificate');
      assert (select category_label = 'Contrôle de la fixture' from public.fleet_certificates where id = certificate),
        'Saved line did not use canonical category label';

      begin
        perform public.create_fleet_certificate_line(maritime, 'test-river-child', 'Fixture', 'Wrong type line');
        raise exception 'Created line with category of wrong vessel type';
      exception when invalid_parameter_value then null;
      end;
      begin
        perform public.create_fleet_certificate_document(
          river, '04-assurance', 'Fixture', 'Wrong type file', 'test.pdf', 'test.pdf', 'fixture/test.pdf'
        );
        raise exception 'Created file metadata with category of wrong vessel type';
      exception when invalid_parameter_value then null;
      end;
      begin
        perform public.update_fleet_certificate_document_metadata(
          certificate, maritime, 'test-river-child', 'Fixture', 'Wrong vessel type document'
        );
        raise exception 'Moved certificate across vessel types with its old category';
      exception when invalid_parameter_value then null;
      end;

      update public.fleet_certificate_categories set is_active = false where id = child_category;
      update public.fleet_certificate_categories set is_active = false where id = parent_category;
      begin
        update public.fleet_certificate_categories set is_active = true where id = child_category;
        raise exception 'Restored child under an archived parent';
      exception when check_violation then null;
      end;
      begin
        perform public.create_fleet_certificate_line(river, 'test-river-child', 'Fixture', 'Archived category line');
        raise exception 'Created line with archived category';
      exception when invalid_parameter_value then null;
      end;
      perform public.update_fleet_certificate_document_metadata(
        certificate, river, 'test-river-child', 'Outdated label', 'Renamed historic document'
      );
      assert (
        select category_label = 'Contrôle de la fixture' and document_title = 'Renamed historic document'
        from public.fleet_certificates where id = certificate
      ), 'Archived category blocked unrelated metadata updates or lost its historical label';
      update public.fleet_certificate_categories set is_active = true where id = parent_category;
      update public.fleet_certificate_categories
        set is_active = true, category_label = 'Contrôle renommé'
        where id = child_category;
      assert exists (
        select 1 from public.fleet_certificate_categories
        where id = child_category and is_active and category_label = 'Contrôle renommé'
      ), 'Category was not restored and renamed';

      -- The trusted lifting workflow has its own fixed report category, even
      -- for a vessel whose manually assignable catalog omits that category.
      perform public.save_lifting_item(
        river, 'lifting', '{"reference":"L1","material_type":"Élingue","description":"Fixture","swl_tonnes":2}'
      );
      inspection := public.start_lifting_inspection(river, 'lifting', current_date, current_date + 365);
      select id into strict inspection_entry from public.lifting_inspection_entries where inspection_id = inspection;
      inspection_revision := public.save_lifting_inspection_entry(
        inspection, inspection_entry, 1, 'good', '{"EG":"ok","ID":"ok","NID":"na","V1":"ok","V2":"ok","V3":"ok","V4":"ok","V5":"ok"}', ''
      );
      report_path := company || '/IDF-CERT/lifting/' || inspection || '/' || inspection_revision || '-fixture.pdf';
      execute 'reset role';
      insert into storage.objects (bucket_id, name, metadata)
        values ('fleet-certificates', report_path, '{"mimetype":"application/pdf","size":100}');
      execute 'set local role authenticated';
      lifting_certificate := public.publish_lifting_inspection(inspection, inspection_revision, report_path, 'fixture.pdf', 100);
      assert exists (
        select 1 from public.fleet_certificates
        where id = lifting_certificate and vessel_id = river and category_key = '08-3-accessoires-levage'
      ), 'Lifting report could not publish for a river vessel';
    end if;

    execute 'reset role';
  end loop;
end;
$test$;

rollback;
