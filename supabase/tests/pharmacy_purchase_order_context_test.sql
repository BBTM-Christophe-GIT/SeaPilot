begin;
do $test$
declare
  company bigint;
  foreign_company bigint;
  vessel bigint;
  unassigned_vessel bigint;
  foreign_vessel bigint;
  signer bigint;
  assignment bigint;
  actor uuid;
  label text;
  counter integer := 0;
  path text;
  result jsonb;
  today date := (current_timestamp at time zone 'Europe/Paris')::date;
begin
  assert not has_function_privilege('anon', 'public.pharmacy_purchase_order_context(bigint)', 'EXECUTE'),
    'Anonymous accounts cannot issue purchase orders';
  insert into public.companies(code, name) values('pharmacy-order-test', 'Pharmacy order fixture') returning id into company;
  insert into public.companies(code, name) values('pharmacy-order-foreign', 'Foreign pharmacy fixture') returning id into foreign_company;
  insert into public.vessels(company_id, name, asset_kind, medical_dotation, registration_number, imo_number, medical_emergency_bag)
    values(company, 'PHARMACY ORDER', 'vessel', 'Dotation B restreinte', 'TEST-123', '9123456', true) returning id into vessel;
  insert into public.vessels(company_id, name, asset_kind)
    values(company, 'PHARMACY UNASSIGNED', 'vessel') returning id into unassigned_vessel;
  insert into public.vessels(company_id, name, asset_kind)
    values(foreign_company, 'PHARMACY FOREIGN', 'vessel') returning id into foreign_vessel;

  insert into public.pharmacy_inventory(company_id, vessel_id, designation, medical_dotation, medical_section, active) values
    (company, vessel, 'Stock courant', 'B restreinte', 'medicines', true),
    (company, vessel, 'Stock sac', 'sac medical d''urgence', 'medicines', true),
    (company, vessel, 'Stock archivé', 'B restreinte', 'medicines', false),
    (company, vessel, 'Ancienne dotation', 'C', 'medicines', true),
    (company, unassigned_vessel, 'Autre navire', 'B restreinte', 'medicines', true);
  insert into pharmacy_private.dotation_requirements(company_id, dotation_key, medical_section, designation_key, designation, required_quantity)
    values(company, 'dotation b restreinte', 'medicines', 'article absent', 'Article absent', '1 boîte'),
      (company, 'dotation c', 'medicines', 'ancienne dotation', 'Ancienne dotation', '1 boîte'),
      (foreign_company, 'dotation b restreinte', 'medicines', 'autre societe', 'Autre société', '1 boîte');

  foreach label in array array['admin','direction','armement','capitaine','marin','unsigned','unlinked'] loop
    counter := counter + 1;
    actor := ('1f9d0000-0000-4000-8000-' || lpad(counter::text, 12, '0'))::uuid;
    insert into auth.users(id, email) values(actor, 'pharmacy-order-' || label || '@example.invalid');
    insert into public.profiles(id, email, display_name, active_company_id)
      values(actor, 'pharmacy-order-' || label || '@example.invalid', 'Compte ' || label, company);
    insert into public.user_roles(company_id, user_id, role_key)
      values(company, actor, case when label in ('unsigned', 'unlinked') then 'admin' else label end);
    if label <> 'unlinked' then
      insert into public.people(company_id, user_id, first_name, last_name, function_label)
        values(company, actor, 'Émetteur', upper(label), 'Fonction RH') returning id into signer;
    end if;
    if label not in ('unsigned', 'unlinked') then
      path := company || '/' || signer || '/pharmacy-order.png';
      if label = 'direction' then
        insert into public.document_blob_files(source_bucket, source_path, blob_pathname, blob_url, file_name,
          mime_type, bytes, sha256, source_sha256, verified_at)
          values('working-time-signatures', path, 'documents/' || path,
            'https://fixture.private.blob.vercel-storage.com/documents/' || path,
            'pharmacy-order.png', 'image/png', 100, repeat('a',64), repeat('a',64), now());
      else
        insert into storage.objects(bucket_id, name, owner_id, metadata)
          values('working-time-signatures', path, actor::text, '{"mimetype":"image/png","size":100}');
      end if;
      insert into public.working_time_profile_signatures(company_id, person_id, version_number, storage_path, mime_type, file_size_bytes, sha256)
        values(company, signer, 1, path, 'image/png', 100, repeat('a',64));
    end if;
    if label in ('admin', 'armement', 'capitaine', 'marin') then
      insert into public.planning_assignments(company_id, vessel_id, crew_person_id, starts_on, ends_on, assignment_role, status_label, confirmation_status)
        values(company, vessel, signer, today - 1, today + 1,
          case label when 'admin' then 'Équipage' when 'armement' then 'Chef mécanicien' else 'Capitaine' end,
          'En Mer', 'confirmed') returning id into assignment;
      if label = 'capitaine' then
        insert into public.planning_days(company_id, person_id, vessel_id, crew_name, vessel_name, work_date,
          year_number, month_number, month_label, day_number, function_label, sailor_status, day_status, slot365, source_label)
          values(company, signer, vessel, 'Émetteur CAPITAINE', 'PHARMACY ORDER', today,
            extract(year from today), extract(month from today), to_char(today,'TMMonth'), extract(day from today),
            'Second capitaine', 'En Mer', 'État quotidien', 'assignment:' || assignment::text, 'seapilot-assignment-note');
      end if;
    end if;

    perform set_config('request.jwt.claim.sub', actor::text, true);
    execute 'set local role authenticated';
    if label in ('admin','direction','armement','capitaine') then
      result := public.pharmacy_purchase_order_context(vessel);
      assert result->>'signer_name' = 'Émetteur ' || upper(label) and result->>'signature_path' = path
        and result->>'signature_mime_type' = 'image/png', 'The issuer and signature come from the same connected HR identity';
      assert result->>'signer_function' = case label when 'capitaine' then 'Second capitaine' when 'armement' then 'Chef mécanicien' else 'Fonction RH' end,
        'Daily functions take priority over assignment functions, with HR fallback for absent or legacy department labels';
      assert result->>'issued_on' = today::text and result->>'vessel_name' = 'PHARMACY ORDER'
        and result->>'registration_number' = 'TEST-123' and result->>'imo_number' = '9123456'
        and result->>'medical_dotation' = 'Dotation B restreinte' and (result->>'medical_emergency_bag')::boolean,
        'Vessel fields, emergency bag inclusion and Paris issue date come from their source records';
      assert jsonb_array_length(result->'items') = 2
        and result->'items' @> '[{"designation":"Stock courant"},{"designation":"Stock sac"}]',
        'Only active items from this vessel, its current dotation and its checked bag are returned';
      assert (select jsonb_agg(entry) @> '[{"designation":"Article absent"}]' and count(*) = 1
        from jsonb_array_elements(result->'requirements') entry where not entry ? 'catalog_code'),
        'Only this company’s current custom dotation targets are returned, including absent items';
      assert (result->'requirements') @> '[{"dotation_key":"dotation b restreinte","catalog_code":"M004"},
        {"dotation_key":"sac medical d''urgence","catalog_code":"M004"}]',
        'The current official dotation and the enabled emergency bag both supply order requirements';
      begin
        perform public.pharmacy_purchase_order_context(foreign_vessel);
        raise exception 'Cross-company vessel accepted';
      exception when insufficient_privilege then null; end;
      if label = 'capitaine' then
        begin
          perform public.pharmacy_purchase_order_context(unassigned_vessel);
          raise exception 'Unassigned vessel accepted for a Captain';
        exception when insufficient_privilege then null; end;
      else
        result := public.pharmacy_purchase_order_context(unassigned_vessel);
        assert (result->'imo_number') = 'null'::jsonb, 'A vessel without IMO has no fictitious value';
        assert not (result->>'medical_emergency_bag')::boolean and result->'requirements' = '[]'::jsonb,
          'An unchecked bag and unset vessel dotation do not add order requirements';
      end if;
    elsif label = 'marin' then
      begin
        perform public.pharmacy_purchase_order_context(vessel);
        raise exception 'A Marin with a temporary Captain function issued the order';
      exception when insufficient_privilege then null; end;
    else
      begin
        perform public.pharmacy_purchase_order_context(vessel);
        raise exception 'Issuer without HR identity or active signature accepted';
      exception when check_violation then
        assert (label = 'unsigned' and sqlerrm like 'Ajoutez une signature%')
          or (label = 'unlinked' and sqlerrm like 'Associez votre compte%'), 'Missing prerequisites have distinct messages';
      end;
    end if;
    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', true);
  end loop;
end;
$test$;
rollback;
