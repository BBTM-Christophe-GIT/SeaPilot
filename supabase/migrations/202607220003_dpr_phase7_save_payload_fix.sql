-- Keep the applied Phase 7 history immutable while correcting the port-call
-- identifier variable detected by plpgsql_check after the initial deployment.
create or replace function public.dpr_save_payload(target_dpr_id bigint, target_payload jsonb)
returns public.dpr_reports
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  current_report public.dpr_reports;
  target_company_id bigint;
  item jsonb;
  reason_item jsonb;
  created_port_call_id bigint;
  hse jsonb := coalesce(target_payload -> 'hseActions', '{}'::jsonb);
begin
  if target_payload is null or jsonb_typeof(target_payload) <> 'object' then
    raise exception 'DPR payload must be a JSON object' using errcode = '22023';
  end if;

  if target_dpr_id is null then
    select * into current_report
    from public.dpr_create_draft(
      nullif(target_payload ->> 'reportDate', '')::date,
      nullif(target_payload ->> 'projectId', '')::bigint,
      target_payload ->> 'unlistedProjectName',
      nullif(target_payload ->> 'vesselId', '')::bigint,
      target_payload ->> 'description',
      target_payload ->> 'qhseNote'
    );
  else
    if not public.dpr_user_can_edit(target_dpr_id) then
      raise exception 'Insufficient permission to save this DPR' using errcode = '42501';
    end if;
    select * into current_report
    from public.dpr_update_draft(
      target_dpr_id,
      nullif(target_payload ->> 'reportDate', '')::date,
      nullif(target_payload ->> 'projectId', '')::bigint,
      target_payload ->> 'unlistedProjectName',
      nullif(target_payload ->> 'vesselId', '')::bigint,
      target_payload ->> 'description',
      target_payload ->> 'qhseNote'
    );
  end if;

  target_company_id := current_report.company_id;

  delete from public.dpr_port_call_reasons reason
  where reason.port_call_id in (
    select call.id from public.dpr_port_calls call where call.dpr_id = current_report.id
  );
  delete from public.dpr_port_calls where dpr_id = current_report.id;
  delete from public.dpr_crew_members where dpr_id = current_report.id;
  delete from public.dpr_other_people where dpr_id = current_report.id;
  delete from public.dpr_incidents where dpr_id = current_report.id;
  delete from public.dpr_hse_actions where dpr_id = current_report.id;
  delete from public.dpr_emergency_exercises where dpr_id = current_report.id;
  delete from public.dpr_supplies where dpr_id = current_report.id;
  delete from public.dpr_waste_records where dpr_id = current_report.id;
  delete from public.dpr_daily_metrics where dpr_id = current_report.id;

  insert into public.dpr_daily_metrics (
    dpr_id, company_id, fuel_consumed_liters, fuel_on_board_liters
  ) values (
    current_report.id,
    target_company_id,
    nullif(target_payload #>> '{metrics,fuelConsumedLiters}', '')::numeric,
    nullif(target_payload #>> '{metrics,fuelOnBoardLiters}', '')::numeric
  );

  for item in select value from jsonb_array_elements(coalesce(target_payload -> 'crewMembers', '[]'::jsonb)) loop
    insert into public.dpr_crew_members (
      dpr_id, company_id, person_id, crew_function, roster_group, display_name_snapshot, display_order
    ) values (
      current_report.id, target_company_id, (item ->> 'personId')::bigint,
      item ->> 'crewFunction', nullif(item ->> 'rosterGroup', ''),
      item ->> 'displayName', coalesce((item ->> 'displayOrder')::integer, 0)
    );
  end loop;

  for item in select value from jsonb_array_elements(coalesce(target_payload -> 'otherPeople', '[]'::jsonb)) loop
    insert into public.dpr_other_people (
      dpr_id, company_id, person_id, display_name_snapshot, display_order
    ) values (
      current_report.id, target_company_id, nullif(item ->> 'personId', '')::bigint,
      item ->> 'displayName', coalesce((item ->> 'displayOrder')::integer, 0)
    );
  end loop;

  for item in select value from jsonb_array_elements(coalesce(target_payload -> 'incidents', '[]'::jsonb)) loop
    insert into public.dpr_incidents (dpr_id, company_id, category, level, notes)
    values (
      current_report.id, target_company_id, item ->> 'category', item ->> 'level',
      nullif(item ->> 'notes', '')
    );
  end loop;

  insert into public.dpr_hse_actions (
    dpr_id, company_id, tbt_performed, tbt_theme, hse_visit_performed,
    hse_audit_performed, good_practices_count, dangerous_situations_count, stop_work_count
  ) values (
    current_report.id,
    target_company_id,
    coalesce((hse ->> 'tbtPerformed')::boolean, false),
    case when coalesce((hse ->> 'tbtPerformed')::boolean, false) then nullif(hse ->> 'tbtTheme', '') else null end,
    coalesce((hse ->> 'hseVisitPerformed')::boolean, false),
    coalesce((hse ->> 'hseAuditPerformed')::boolean, false),
    coalesce(nullif(hse ->> 'goodPracticesCount', '')::integer, 0),
    coalesce(nullif(hse ->> 'dangerousSituationsCount', '')::integer, 0),
    coalesce(nullif(hse ->> 'stopWorkCount', '')::integer, 0)
  );

  for item in select value from jsonb_array_elements(coalesce(target_payload -> 'emergencyExercises', '[]'::jsonb)) loop
    insert into public.dpr_emergency_exercises (dpr_id, company_id, exercise_type_key, notes)
    values (current_report.id, target_company_id, item ->> 'key', nullif(item ->> 'notes', ''));
  end loop;

  for item in select value from jsonb_array_elements(coalesce(target_payload -> 'portCalls', '[]'::jsonb)) loop
    insert into public.dpr_port_calls (
      dpr_id, company_id, port_name, arrival_at, departure_at, display_order
    ) values (
      current_report.id,
      target_company_id,
      nullif(item ->> 'portName', ''),
      nullif(item ->> 'arrivalAt', '')::timestamptz,
      nullif(item ->> 'departureAt', '')::timestamptz,
      coalesce((item ->> 'displayOrder')::integer, 0)
    ) returning id into created_port_call_id;

    for reason_item in select value from jsonb_array_elements(coalesce(item -> 'reasons', '[]'::jsonb)) loop
      insert into public.dpr_port_call_reasons (port_call_id, company_id, reason_type_key)
      values (created_port_call_id, target_company_id, trim(both '"' from reason_item::text));
    end loop;
  end loop;

  if target_payload ? 'supplies' then
    insert into public.dpr_supplies (dpr_id, company_id, fuel_m3, oil_liters, water_m3)
    values (
      current_report.id,
      target_company_id,
      nullif(target_payload #>> '{supplies,fuelM3}', '')::numeric,
      nullif(target_payload #>> '{supplies,oilLiters}', '')::numeric,
      nullif(target_payload #>> '{supplies,waterM3}', '')::numeric
    );
  end if;

  for item in select value from jsonb_array_elements(coalesce(target_payload -> 'wasteRecords', '[]'::jsonb)) loop
    insert into public.dpr_waste_records (dpr_id, company_id, waste_type_key, quantity, unit)
    values (
      current_report.id, target_company_id, item ->> 'key',
      coalesce(nullif(item ->> 'quantity', '')::numeric, 0), item ->> 'unit'
    );
  end loop;

  select * into current_report from public.dpr_reports where id = current_report.id;
  return current_report;
end;
$$;

comment on function public.dpr_save_payload(bigint, jsonb) is
  'Atomically saves the six-step native DPR form while preserving workflow and tenant rules.';
